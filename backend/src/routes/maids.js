// Maid discovery — search, filters, §10 visibility decay (unified spec).
//
//   GET /api/maids        browse + search (requireAuth — read-only scope §15.1)
//   GET /api/maids/rails  employer-home rails in ONE call: featured (paid
//                         profile boost §15.5), nearby (caller's county),
//                         verified (KYC approved), topRated (quality score —
//                         PROXY until a real ratings feature is specced)
//   GET /api/maids/:id    public profile of one househelp (no contact details —
//                         phone/chat only through the verified, gated flows)
//
// §10 decay (driven by users.last_active_at):
//   0–13d  Active   — normal, ranked first
//   14–29d Quiet    — fully visible, ranked below Active within a tier
//   30–59d Dormant  — EXCLUDED from default browse AND curated rails; findable
//                     only when a search term (q) is present, with a label
//   60+    Archived — never in browse/search (threads/applications stay live)
//
// §15.5 profile boost (KES 99 / 7 days, "rotating top-of-feed"): a maid with
// boost active (maid_profiles.boosted_until > NOW()) ranks FIRST in every
// rail/browse order and carries featured: true — placement is not purchasable
// any other way (MPS amendment).
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const JOB_TYPES = ['live_in', 'live_out', 'day_burg'];
const JOB_TYPE_LABELS = { live_in: 'Live-in', live_out: 'Live-out', day_burg: 'Day burg' };

function lastActiveLabel(days) {
  if (days === null || days === undefined) return 'New here';
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 14) return `Active ${days} days ago`;
  if (days < 30) return 'Last active 2 weeks ago';
  if (days < 60) return 'Last active a while ago';
  return 'Archived';
}

// Haversine distance in km (1 decimal) — owner request 2026-11-01: "for maids
// detail screen we need to have distance in km". Returns null when EITHER
// party has no coordinates (signup GPS is optional) — the UI hides the chip
// rather than guessing. Raw lat/lng of BOTH parties stays server-side; only
// the derived km figure ever leaves the gateway (privacy).
function distanceKm(aLat, aLng, bLat, bLng) {
  if (aLat === null || aLat === undefined || aLng === null || aLng === undefined ||
      bLat === null || bLat === undefined || bLng === null || bLng === undefined) return null;
  const R = 6371; // km
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

// §15.5/§10 quality-score proxy (the same formula that drives the topRated
// rail) normalized to a 5-star scale — owner request 2026-11-01: "star rating
// etc". NO reviews table exists in any spec, so this is EXPLICITLY a proxy:
//   trust badge 40 · experience (2/yr, cap 30) · §7 profile depth (4/field,
//   cap 20) · fresh ≤3d 10 → 0..100 → /20 → 0.0..5.0 stars.
// rating is null until there is SUBSTANTIVE signal (badge, experience or ≥2
// profile fields) — freshness alone is activity, not quality, and must not
// render as "0.5 stars". ratingBasis: 'proxy' lets the UI label it honestly
// ("Maidora score") instead of implying user reviews.
function qualityScore(r) {
  const profileFields =
    ((r.bio ? 1 : 0) + (r.languages && r.languages !== '[]' ? 1 : 0) +
      (r.wage_expectation !== null && r.wage_expectation !== undefined ? 1 : 0) +
      (r.job_type ? 1 : 0) + (r.date_of_birth ? 1 : 0));
  return (
    (r.kyc_status === 'approved' ? 40 : 0) +
    Math.min(Number(r.years_experience || 0), 15) * 2 +
    profileFields * 4 +
    (r.days_idle !== null && Number(r.days_idle) <= 3 ? 10 : 0)
  );
}

function starRating(r) {
  const badge = r.kyc_status === 'approved';
  const exp = Number(r.years_experience || 0);
  const profileFields =
    ((r.bio ? 1 : 0) + (r.languages && r.languages !== '[]' ? 1 : 0) +
      (r.wage_expectation !== null && r.wage_expectation !== undefined ? 1 : 0) +
      (r.job_type ? 1 : 0) + (r.date_of_birth ? 1 : 0));
  if (!badge && !exp && profileFields < 2) return { rating: null, ratingBasis: 'proxy' };
  const score = qualityScore(r);
  return { rating: Math.round((score / 20) * 10) / 10, ratingBasis: 'proxy' };
}

// Shared SELECT for list + detail. NEVER exposes contact details or next of
// kin — those move through gated chat/application flows only. Coordinates are
// read ONLY to compute distanceKm server-side; they are never returned.
const SELECT_COLUMNS = `
  u.id AS user_id, u.full_name, u.avatar_url, u.location_county, u.location_area,
  u.location_name, u.last_active_at, u.kyc_status, u.created_at,
  u.latitude AS u_lat, u.longitude AS u_lng,
  mp.date_of_birth, mp.gender, mp.languages, mp.job_type, mp.years_experience,
  mp.wage_expectation, mp.bio,
  mp.boosted_until,
  (mp.boosted_until IS NOT NULL AND mp.boosted_until > NOW()) AS is_boosted,
  TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) AS days_idle
`;

// §15.5 featured placement comes first everywhere; then the §10 tiers.
const RANK_SQL =
  'ORDER BY (mp.boosted_until IS NOT NULL AND mp.boosted_until > NOW()) DESC, ' +
  '(u.last_active_at IS NOT NULL AND u.last_active_at > (NOW() - INTERVAL 14 DAY)) DESC, u.last_active_at DESC';

function shapeMaid(r, { detailed = false, caller = null } = {}) {
  const age = r.date_of_birth
    ? Math.floor((Date.now() - new Date(r.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const stars = starRating(r);
  return {
    id: r.user_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url || null,
    locationCounty: r.location_county || null,
    locationArea: r.location_area || null,
    locationName: r.location_name || null,
    trustBadge: r.kyc_status === 'approved',
    kycStatus: r.kyc_status || 'not_started',
    languages: r.languages ? (typeof r.languages === 'string' ? JSON.parse(r.languages) : r.languages) : [],
    jobType: r.job_type || null,
    jobTypeLabel: JOB_TYPE_LABELS[r.job_type] || null,
    yearsExperience: r.years_experience === null || r.years_experience === undefined ? null : Number(r.years_experience),
    expectedSalary: r.wage_expectation === null || r.wage_expectation === undefined ? null : Number(r.wage_expectation),
    bio: detailed ? r.bio || null : r.bio ? String(r.bio).slice(0, 120) : null,
    age,
    gender: r.gender || null,
    // Distance from the CALLER (haversine, km, 1dp) — null when either side
    // lacks coordinates. Raw lat/lng never leaves the server.
    distanceKm: caller ? distanceKm(caller.lat, caller.lng, r.u_lat, r.u_lng) : null,
    // Star rating — Maidora quality-score proxy (see starRating above).
    rating: stars.rating,
    ratingBasis: stars.ratingBasis,
    // §10 + §4.3 — employer-facing "last seen" uses last_active_at
    lastActiveDays: r.days_idle === null ? null : Number(r.days_idle),
    lastActiveLabel: lastActiveLabel(r.days_idle === null ? null : Number(r.days_idle)),
    memberSince: r.created_at ? String(r.created_at).slice(0, 10) : null,
    // §15.5 — paid profile boost ("Featured" badge + top-of-feed placement)
    featured: Number(r.is_boosted) === 1,
    featuredUntil: r.boosted_until || null,
  };
}

// GET /api/maids?q=&county=&job_type=&min_experience=&max_salary=&verified=1
//               &include_dormant=0&page=1&per_page=12
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const county = String(req.query.county || '').trim().slice(0, 120);
    const jobType = String(req.query.job_type || '').trim();
    const minExp = parseInt(req.query.min_experience, 10);
    const maxSalary = parseInt(req.query.max_salary, 10);
    const verifiedOnly = req.query.verified === '1';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(24, Math.max(1, parseInt(req.query.per_page, 10) || 12));

    const where = [
      "u.role = 'househelp'",
      "u.account_status = 'active'",
      // §10 archived (60d+) never appears anywhere.
      '(u.last_active_at IS NULL OR u.last_active_at > (NOW() - INTERVAL 60 DAY))',
    ];
    const params = [];

    // §10 dormant (30–59d) — only when the caller is actually SEARCHING.
    if (q) {
      where.push('(u.full_name LIKE ? OR mp.bio LIKE ? OR mp.languages LIKE ? OR u.location_area LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like);
    } else {
      where.push('(u.last_active_at IS NULL OR u.last_active_at > (NOW() - INTERVAL 30 DAY))');
    }

    if (county) {
      where.push('u.location_county = ?');
      params.push(county);
    }
    if (JOB_TYPES.includes(jobType)) {
      where.push('mp.job_type = ?');
      params.push(jobType);
    }
    if (Number.isInteger(minExp) && minExp > 0) {
      where.push('mp.years_experience >= ?');
      params.push(minExp);
    }
    if (Number.isInteger(maxSalary) && maxSalary > 0) {
      where.push('mp.wage_expectation IS NOT NULL AND mp.wage_expectation <= ?');
      params.push(maxSalary);
    }
    if (verifiedOnly) {
      where.push("u.kyc_status = 'approved'");
    }
    if (req.query.featured === '1') {
      // §15.5 — only maids whose paid profile boost is active right now.
      where.push('mp.boosted_until IS NOT NULL AND mp.boosted_until > NOW()');
    }

    const whereSql = where.join(' AND ');
    // §15.5 featured first, then §10 ranking (Active maids, most-recent first).
    const orderSql = RANK_SQL;

    // Caller coordinates — ONLY for the derived distanceKm (never returned).
    const [[callerRow]] = await pool.query(
      'SELECT latitude, longitude FROM users WHERE id = ?',
      [req.user.uid]
    );
    const caller = callerRow ? { lat: callerRow.latitude, lng: callerRow.longitude } : null;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM users u LEFT JOIN maid_profiles mp ON mp.user_id = u.id
       WHERE ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM users u LEFT JOIN maid_profiles mp ON mp.user_id = u.id
       WHERE ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, perPage, (page - 1) * perPage]
    );

    // Counties actually present in THIS result — the app renders them as
    // filter chips, so the list never offers a county with no maids behind it.
    let counties = [];
    if (page === 1) {
      [counties] = await pool.query(
        `SELECT DISTINCT u.location_county AS county
         FROM users u
         WHERE u.role = 'househelp' AND u.account_status = 'active'
           AND u.location_county IS NOT NULL AND u.location_county != ''
           AND (u.last_active_at IS NULL OR u.last_active_at > (NOW() - INTERVAL 60 DAY))
         ORDER BY county LIMIT 30`
      );
      counties = counties.map((r) => r.county);
    }

    res.json({
      maids: rows.map((r) => shapeMaid(r, { caller })),
      page,
      perPage,
      total,
      hasMore: page * perPage < total,
      counties,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/maids/rails — the employer-home rails in ONE round trip.
// Rails (owner request 2026-11-01, MPS §15.5 placement):
//   featured  — paid profile boost active (maid_profiles.boosted_until > NOW())
//   nearby    — maids in the CALLER's county (falls back to nationwide when
//               the caller has no county or nobody matches — flagged)
//   verified  — Trust Badge only (kyc_status = 'approved')
//   topRated  — PROXY quality score until a real ratings feature exists:
//               trust badge 40 · years of experience up to 30 (2/yr, cap 15)
//               · §7 profile fields present up to 20 · active ≤3d 10.
//               Documented as a proxy — never silently assumed to be "real"
//               ratings (no reviews table exists anywhere in the specs).
// Every rail applies the §10 gates (active accounts, dormant/archived out).
router.get('/rails', requireAuth, async (req, res, next) => {
  try {
    const perRail = Math.min(8, Math.max(1, parseInt(req.query.per_rail, 10) || 6));
    // §10 base gates — identical to browse (rails are curated browse).
    const baseWhere = [
      "u.role = 'househelp'",
      "u.account_status = 'active'",
      '(u.last_active_at IS NULL OR u.last_active_at > (NOW() - INTERVAL 30 DAY))',
    ];
    const baseSql = `FROM users u LEFT JOIN maid_profiles mp ON mp.user_id = u.id WHERE ${baseWhere.join(' AND ')}`;

    // Caller coordinates — ONLY for the derived distanceKm (never returned).
    const [[callerRow]] = await pool.query(
      'SELECT latitude, longitude FROM users WHERE id = ?',
      [req.user.uid]
    );
    const caller = callerRow ? { lat: callerRow.latitude, lng: callerRow.longitude } : null;

    async function rail(where, order, params = []) {
      const [rows] = await pool.query(
        `SELECT ${SELECT_COLUMNS} ${baseSql}${where ? ` AND ${where}` : ''} ${order} LIMIT ${perRail}`,
        params
      );
      return rows.map((r) => shapeMaid(r, { caller }));
    }

    // 1. FEATURED — the paid placement rail.
    const featured = await rail(
      'mp.boosted_until IS NOT NULL AND mp.boosted_until > NOW()',
      'ORDER BY mp.boosted_until DESC, u.last_active_at DESC'
    );

    // 2. NEAR ME — caller's county first; nationwide fallback when empty.
    const [[me]] = await pool.query('SELECT location_county FROM users WHERE id = ?', [req.user.uid]);
    let nearby = [];
    let nearbyCounty = me?.location_county || null;
    let nearbyFallback = false;
    if (nearbyCounty) {
      nearby = await rail('u.location_county = ?', RANK_SQL, [nearbyCounty]);
    }
    if (!nearby.length) {
      nearbyFallback = true;
      nearbyCounty = null;
      nearby = await rail('', RANK_SQL);
    }

    // 3. VERIFIED — Trust Badge holders.
    const verified = await rail("u.kyc_status = 'approved'", RANK_SQL);

    // 4. TOP RATED — quality-score proxy (see docblock).
    const topRated = await rail(
      '',
      `ORDER BY (
         (u.kyc_status = 'approved') * 40
         + LEAST(COALESCE(mp.years_experience, 0), 15) * 2
         + ((mp.bio IS NOT NULL AND mp.bio != '') + (mp.languages IS NOT NULL AND mp.languages != '[]')
            + (mp.wage_expectation IS NOT NULL) + (mp.job_type IS NOT NULL)
            + (mp.date_of_birth IS NOT NULL)) * 4
         + (u.last_active_at IS NOT NULL AND u.last_active_at > (NOW() - INTERVAL 3 DAY)) * 10
       ) DESC, u.last_active_at DESC`
    );

    res.json({
      featured,
      nearby,
      nearbyCounty,
      nearbyFallback,
      verified,
      topRated,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/maids/:id — public profile (direct links/threads stay live for
// dormant/archived maids per §10; only deleted/suspended accounts 404).
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id || '');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) return res.status(400).json({ message: 'Invalid profile id.' });

    const [[row]] = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM users u LEFT JOIN maid_profiles mp ON mp.user_id = u.id
       WHERE u.id = ? AND u.role = 'househelp' AND u.account_status IN ('active')`,
      [id]
    );
    if (!row) return res.status(404).json({ message: 'This profile is not available.' });

    // Caller coordinates — ONLY for the derived distanceKm (never returned).
    const [[callerRow]] = await pool.query(
      'SELECT latitude, longitude FROM users WHERE id = ?',
      [req.user.uid]
    );
    const caller = callerRow ? { lat: callerRow.latitude, lng: callerRow.longitude } : null;

    res.json({ maid: shapeMaid(row, { detailed: true, caller }) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
