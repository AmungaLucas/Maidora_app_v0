// seed_demo.js — marketplace demo data: 20 maids + 7 employers (+ jobs,
// applications, chat threads) so every screen ships with life.
//
// Idempotent by MARKER: every seeded user's email ends @demo.maidora.co.ke.
// Re-running DELETES those users (children CASCADE) and re-inserts fresh.
// Real accounts (owner, payments, KYC) are never touched.
//
// Run on the server:
//   /home/maidorac/nodevenv/maidora_app/24/bin/node sql/seed_demo.js
//
// Login for all demo accounts: password Demo#1234 (owner-only knowledge —
// documented in WORKLOG/Architecture, not a real user credential).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const MARKER = '@demo.maidora.co.ke';
const PASSWORD = 'Demo#1234';

// Deterministic uuid (v4-shaped) from a slug so re-runs are stable.
function uuidFrom(slug) {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update('maidora-demo:' + slug).digest('hex');
  const u = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return u;
}

const LANGS = ['Kiswahili', 'English', 'Kikuyu', 'Luo', 'Luhya', 'Kamba', 'Kisii', 'Meru', 'Kalenjin', 'Maasai', 'Somali', 'Giriama'];
const JOB_TYPES = ['live_in', 'live_out', 'day_burg'];

// [name, county, area, lat, lng]
const MAID_PLACES = [
  ['Nairobi', 'Utawala', -1.3167, 36.9333], ['Nairobi', 'Kilimani', -1.2921, 36.7834],
  ['Nairobi', 'Kasarani', -1.2236, 36.8908], ['Nairobi', 'South B', -1.3128, 36.8299],
  ['Nairobi', 'Embakasi', -1.3167, 36.9], ['Nairobi', 'Westlands', -1.2673, 36.8065],
  ['Nairobi', 'Ruaraka', -1.2419, 36.8722], ['Nairobi', 'Langata', -1.3402, 36.7469],
  ['Nairobi', 'Dagoretti', -1.2961, 36.7547], ['Nairobi', 'Kayole', -1.2833, 36.9333],
  ['Kiambu', 'Ruiru', -1.15, 36.9667], ['Kiambu', 'Kikuyu', -1.2467, 36.6667],
  ['Kiambu', 'Thika', -1.0333, 37.0833], ['Kajiado', 'Ngong', -1.3567, 36.645],
  ['Kajiado', 'Kitengela', -1.3667, 36.9333], ['Machakos', 'Mlolongo', -1.3833, 36.9],
  ['Mombasa', 'Nyali', -4.0333, 39.7], ['Nakuru', 'Milimani', -0.3031, 36.08],
  ['Kisumu', 'Milimani', -0.0917, 34.75], ['Uasin Gishu', 'Kapsoya', 0.5143, 35.28],
];

const MAIDS = [
  ['Grace Wanjiku', 'female', 8, 14000, 'live_in'], ['Mary Achieng', 'female', 12, 16000, 'live_in'],
  ['Faith Njeri', 'female', 5, 12000, 'live_out'], ['Esther Mutheu', 'female', 15, 18000, 'live_in'],
  ['Janet Chebet', 'female', 3, 10000, 'day_burg'], ['Rose Atieno', 'female', 10, 15000, 'live_in'],
  ['Lucy Wairimu', 'female', 7, 13000, 'live_out'], ['Beatrice Nyambura', 'female', 20, 22000, 'live_in'],
  ['Halima Yusuf', 'female', 4, 11000, 'day_burg'], ['Caroline Mwikali', 'female', 6, 12500, 'live_out'],
  ['Nancy Chelangat', 'female', 2, 9500, 'live_in'], ['Agnes Moraa', 'female', 9, 14500, 'live_in'],
  ['Purity Kerubo', 'female', 5, 11500, 'day_burg'], ['Susan Anyango', 'female', 14, 17000, 'live_in'],
  ['Dennis Otieno', 'male', 6, 13500, 'live_out'], ['Peter Kimani', 'male', 11, 16000, 'live_in'],
  ['Sharon Neema', 'female', 3, 10500, 'live_out'], ['Zawadi Mwende', 'female', 7, 12800, 'live_in'],
  ['Miriam Kilonzo', 'female', 13, 16500, 'live_in'], ['Jackline Achieng', 'female', 1, 9000, 'day_burg'],
];

const BIOS = [
  'I have cared for families across {county} for years — cooking, cleaning, laundry and childcare are second nature to me. References available on request.',
  'Clean, patient and trustworthy. I love children and I keep a home spotless. I follow instructions well and I am a great cook.',
  'Experienced house help who respects privacy and keeps routines running smoothly. Punctual, honest and good with toddlers.',
  'I take pride in my work — from deep cleaning to preparing healthy family meals. I am flexible with days and happy with pets around.',
  'Caring and hardworking mother of two. I treat every home like my own and I am comfortable with newborns and school runs.',
  'Reliable and soft-spoken. Strong in laundry, ironing and housekeeping; learning new recipes every month.',
];

const EMPLOYERS = [
  ['James Kamau', 'Nairobi', 'Kilimani', 4, 2, 45000],
  ['Wanjiru & Family', 'Nairobi', 'South B', 5, 3, 38000],
  ['Aisha Hassan', 'Nairobi', 'Westlands', 3, 1, 50000],
  ['David Kariuki', 'Kiambu', 'Ruiru', 6, 3, 35000],
  ['Njeri Otieno', 'Nairobi', 'Langata', 4, 2, 40000],
  ['Samuel Mutiso', 'Machakos', 'Mlolongo', 5, 2, 30000],
  ['Lydia Wafula', 'Nairobi', 'Embakasi', 3, 0, 32000],
];

const JOBS = [
  ['James Kamau', 'Full-time house help — live in', 'Cleaning, laundry, cooking for a family of four. Own room included. Off on Sundays. Start immediately.', 'live_in', 'Nairobi', 'Kilimani', 15000],
  ['Wanjiru & Family', 'Nanny for 2 school-going kids', 'Wake the children, prepare breakfast, school drops nearby, light house chores while they are away. Mon–Sat.', 'live_out', 'Nairobi', 'South B', 13000],
  ['Aisha Hassan', 'Experienced house manager', 'Run a 3-bedroom home: cooking (family recipes welcome), housekeeping, supervising the cleaner. Discretion required.', 'live_in', 'Nairobi', 'Westlands', 25000],
  ['David Kariuki', 'House help — day burg', 'Mon/Wed/Fri: deep cleaning, laundry, ironing. 8am–5pm. Lunch provided.', 'day_burg', 'Kiambu', 'Ruiru', 7000],
  ['Njeri Otieno', 'Live-in nanny + light duties', 'Newborn care experience preferred. Baby is 8 months. Light chores when the baby sleeps. Own room.', 'live_in', 'Nairobi', 'Langata', 16000],
  ['Samuel Mutiso', 'Cook / housekeeper', 'Prepare lunch and supper for a small family, keep the house tidy. Simple balanced meals.', 'live_out', 'Machakos', 'Mlolongo', 11000],
  ['Lydia Wafula', 'Weekend house help', 'Saturdays only: laundry, cleaning, meal prep for the week. Perfect for someone with another weekday job.', 'day_burg', 'Nairobi', 'Embakasi', 4000],
  ['James Kamau', 'House girl — no cooking', 'General cleaning and laundry only. A cook is already employed. Live-in with own room.', 'live_in', 'Nairobi', 'Kilimani', 12000],
  ['Wanjiru & Family', 'Relief nanny (maternity cover)', '3-month contract starting next month. Care for a 2-year-old 8am–4pm weekdays.', 'live_out', 'Nairobi', 'South B', 14000],
  ['Aisha Hassan', 'Trusted house help needed', 'We need someone verified and experienced. Elderly-friendly household, calm environment, 2 cats.', 'live_in', 'Nairobi', 'Westlands', 20000],
];

const APPLY_MESSAGES = [
  'Good morning. I have 8 years of experience with families in Kilimani and I can start immediately. I am comfortable with children and cooking.',
  'Hello, I am very interested. References from my previous employer of 5 years are available. I live nearby and know the area well.',
  'I would love to join your family. I am patient with toddlers and a confident cook. Available for an interview any day.',
  'Karibu. I have worked in two homes with newborns and I am comfortable with night routines when needed.',
  'Hello. I am hardworking and honest, with experience in deep cleaning and laundry. Ready to work the days you listed.',
];

function pick(arr, i) { return arr[i % arr.length]; }

(async () => {
  try {
    await pool.query('SELECT 1');
    const hash = await bcrypt.hash(PASSWORD, 10);

    // ── 1. Purge previous demo data (children CASCADE from users) ──────────
    const [old] = await pool.query('SELECT id FROM users WHERE email LIKE ?', [`%${MARKER}`]);
    for (const u of old) {
      await pool.query('DELETE FROM users WHERE id = ?', [u.id]);
    }
    console.log(`[seed] purged ${old.length} previous demo users`);

    const [openJobsBefore] = await pool.query('SELECT COUNT(*) AS n FROM jobs');

    // ── 2. Employers (7) ────────────────────────────────────────────────────
    const employerIds = {};
    for (let i = 0; i < EMPLOYERS.length; i++) {
      const [name, county, area, hhSize, kids, budget] = EMPLOYERS[i];
      const id = uuidFrom(`employer-${i}`);
      const email = `employer${i + 1}${MARKER}`;
      const phone = `+25470${String(1000000 + i * 111111).slice(0, 8)}`;
      // 5 approved, 2 submitted (variety for the gate + badge UI)
      const kyc = i < 5 ? 'approved' : 'submitted';
      await pool.query(
        `INSERT INTO users (id, full_name, email, phone, role, password_hash, account_status,
           phone_verified_at, kyc_status, kyc_submitted_at, kyc_reviewed_at,
           location_name, location_county, location_area, location_source,
           last_login_at, last_active_at, my_referral_code, created_at)
         VALUES (?, ?, ?, ?, 'employer', ?, 'active', NOW() - INTERVAL 30 DAY, ?, NOW() - INTERVAL 25 DAY,
           ?, ?, ?, ?, 'manual', NOW() - INTERVAL 1 DAY, NOW() - INTERVAL ? HOUR, ?, NOW() - INTERVAL ? DAY)`,
        [id, name, email, phone, hash, kyc,
         kyc === 'approved' ? '2026-10-20 12:00:00' : null,
         `${county}, ${area}`, county, area,
         3 + (i % 40), `M${String(100000 + i * 7919).slice(1)}D`, 40 + i * 3]
      );
      await pool.query(
        `INSERT INTO employer_profiles (user_id, household_size, num_children, budget_amount) VALUES (?, ?, ?, ?)`,
        [id, hhSize, kids, budget]
      );
      employerIds[name] = id;
    }
    console.log(`[seed] ${EMPLOYERS.length} employers inserted`);

    // ── 3. Maids (20) — profile completeness + spread of activity decay ─────
    const maidIds = [];
    for (let i = 0; i < MAIDS.length; i++) {
      const [name, gender, years, wage, jobType] = MAIDS[i];
      const [county, area, lat, lng] = MAID_PLACES[i];
      const id = uuidFrom(`maid-${i}`);
      const email = `maid${i + 1}${MARKER}`;
      const phone = `+25471${String(2000000 + i * 121212).slice(0, 8)}`;
      // 16 approved / 4 submitted — most maids carry the Trust Badge so the
      // search list and profiles show both states.
      const kyc = i < 16 ? 'approved' : 'submitted';
      // last_active spread: 0..50 days idle (§10: active/quiet/dormant mix)
      const idleHours = [2, 5, 10, 20, 30, 50, 70, 90, 120, 200, 240, 300, 360, 400, 480, 600, 720, 900, 1100, 6][i];
      const langs = [pick(LANGS, i), pick(LANGS, i + 3), pick(LANGS, i + 7)];
      const bio = pick(BIOS, i).replaceAll('{county}', county);
      const dob = `19${80 - (i % 22)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO users (id, full_name, email, phone, role, password_hash, account_status,
           phone_verified_at, kyc_status, kyc_submitted_at, kyc_reviewed_at,
           location_name, location_county, location_area, location_source, latitude, longitude,
           last_login_at, last_active_at, my_referral_code, created_at)
         VALUES (?, ?, ?, ?, 'househelp', ?, 'active', NOW() - INTERVAL 60 DAY, ?,
           NOW() - INTERVAL 40 DAY, ?, ?, ?, ?, 'manual', ?, ?, NOW() - INTERVAL ? HOUR,
           NOW() - INTERVAL ? HOUR, ?, NOW() - INTERVAL ? DAY)`,
        [id, name, email, phone, hash, kyc,
         kyc === 'approved' ? '2026-10-18 09:00:00' : null,
         `${county}, ${area}`, county, area, lat, lng,
         Math.min(idleHours, 72), idleHours, `M${String(200000 + i * 6151).slice(1)}M`, 90 + i * 2]
      );
      await pool.query(
        `INSERT INTO maid_profiles (user_id, date_of_birth, gender, languages, job_type,
           years_experience, wage_expectation, bio, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, dob, gender, JSON.stringify(langs), jobType, years, wage, bio,
         pick(['Jane Wanjiru', 'Samuel Ochieng', 'Esther Kavata', 'Paul Kimani'], i),
         `+254722${String(300000 + i * 13431).slice(0, 6)}`,
         pick(['sister', 'brother', 'mother', 'uncle'], i)]
      );
      maidIds.push(id);
    }
    console.log(`[seed] ${MAIDS.length} maids inserted`);

    // ── 4. Jobs (10, one employer posts two) ────────────────────────────────
    const jobIds = [];
    for (let i = 0; i < JOBS.length; i++) {
      const [emp, title, desc, jobType, county, area, salary] = JOBS[i];
      const [ins] = await pool.query(
        `INSERT INTO jobs (employer_id, title, description, job_type, county, area, salary_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NOW() - INTERVAL ? HOUR)`,
        [employerIds[emp], title, desc, jobType, county, area, salary, 2 + i * 9]
      );
      jobIds.push(ins.insertId);
    }
    console.log(`[seed] ${JOBS.length} open jobs inserted`);

    // ── 5. Applications (8) — every status, exercising §9 + job detail UI ───
    const APPS = [
      [0, 0, 'pending'], [3, 0, 'accepted'], [6, 1, 'pending'], [2, 2, 'pending'],
      [10, 3, 'accepted'], [14, 4, 'rejected'], [8, 5, 'pending'], [17, 2, 'withdrawn'],
    ];
    for (let i = 0; i < APPS.length; i++) {
      const [maidIdx, jobIdx, status] = APPS[i];
      await pool.query(
        `INSERT INTO job_applications (job_id, maid_id, message, status, created_at)
         VALUES (?, ?, ?, ?, NOW() - INTERVAL ? HOUR)`,
        [jobIds[jobIdx], maidIds[maidIdx], pick(APPLY_MESSAGES, i), status, 1 + i * 7]
      );
    }
    console.log(`[seed] ${APPS.length} applications inserted`);

    // ── 5.5 Boost state (§15.5) — makes the FEATURED rails + boost UI live ──
    //   • 3 maids carry an ACTIVE profile boost (KES 99/7d) → the Featured
    //     rail on the employer home has real people in it.
    //   • Grace's pending application to James Kamau is BOOSTED (KES 30) →
    //     pins to the top of that employer's applicant list with a badge.
    //   • Grace holds one banked application boost + one banked profile boost
    //     (paid rows, unconsumed) → the Boost button and "Get featured" path
    //     are demoable without an M-Pesa prompt.
    const FEATURED_MAIDS = [1, 3, 7]; // Mary Achieng · Esther Mutheu · Beatrice Nyambura
    for (const [n, idx] of FEATURED_MAIDS.entries()) {
      await pool.query(
        `UPDATE maid_profiles SET boosted_until = NOW() + INTERVAL ? DAY WHERE user_id = ?`,
        [6 - n * 2, maidIds[idx]]
      );
    }
    await pool.query(
      `UPDATE job_applications SET boosted_at = NOW() - INTERVAL 1 HOUR, created_at = NOW() - INTERVAL 30 HOUR
       WHERE job_id = ? AND maid_id = ?`,
      [jobIds[0], maidIds[0]]
    );
    const gracePhone = `+25471${String(2000000).slice(0, 8)}`; // maid #0's seeded phone
    await pool.query(
      `INSERT INTO payments (user_id, purpose, amount, phone, status, mpesa_receipt, result_code, result_desc, created_at)
       VALUES (?, 'application_boost', 30, ?, 'success', 'DEMOBOOST01', 0, 'Demo seed entitlement', NOW() - INTERVAL 2 HOUR),
              (?, 'profile_boost', 99, ?, 'success', 'DEMOBOOST02', 0, 'Demo seed entitlement', NOW() - INTERVAL 3 HOUR)`,
      [maidIds[0], gracePhone, maidIds[0], gracePhone]
    );
    console.log('[seed] boost state: 3 featured maids · 1 boosted application · 2 banked boosts for Grace');

    // ── 6. Chat threads + messages (2 live conversations) ───────────────────
    async function thread(employerName, maidIdx, msgs) {
      const a = [employerIds[employerName], maidIds[maidIdx]].sort();
      const [ins] = await pool.query(
        'INSERT INTO chat_threads (user_a_id, user_b_id) VALUES (?, ?)', a
      );
      for (let i = 0; i < msgs.length; i++) {
        const [fromEmployer, body, minsAgo] = msgs[i];
        await pool.query(
          `INSERT INTO chat_messages (thread_id, sender_id, body, read_at, created_at)
           VALUES (?, ?, ?, ?, NOW() - INTERVAL ? MINUTE)`,
          [ins.insertId, fromEmployer ? employerIds[employerName] : maidIds[maidIdx], body,
           i < msgs.length - 1 ? new Date() : null, minsAgo]
        );
      }
      await pool.query('UPDATE chat_threads SET last_message_at = NOW() WHERE id = ?', [ins.insertId]);
      return ins.insertId;
    }
    await thread('James Kamau', 0, [
      [true, 'Good morning Grace. Thank you for applying — is the room upstairs okay for you?', 300],
      [false, 'Yes sir, that is fine. I can start on Monday.', 280],
      [true, 'Perfect. Come Tuesday at 10am so we meet the family first.', 240],
      [false, 'Tuesday 10am noted. Thank you!', 90],
    ]);
    await thread('Aisha Hassan', 2, [
      [true, 'Hello Esther, the house manager role — are you comfortable with two cats?', 600],
      [false, 'Hello. Yes, I have worked in a home with cats before.', 540],
      [true, 'Great. Can you cook Swahili dishes?', 500],
      [false, 'Yes — pilau, biryani, mahamri. My previous madam can confirm.', 480],
      [true, 'Wonderful. I will call you this week for an interview.', 400],
    ]);
    console.log('[seed] 2 chat threads inserted');

    const [openJobsAfter] = await pool.query('SELECT COUNT(*) AS n FROM jobs');
    console.log(`[seed] jobs in table: ${openJobsBefore[0].n} → ${openJobsAfter[0].n}`);
    console.log('[seed] DONE — login any demo account with phone + Demo#1234');
    console.log('[seed] example maid: +254712000000 (Grace Wanjiku) · example employer: employer1@demo.maidora.co.ke');
    process.exit(0);
  } catch (e) {
    console.error('[seed] FAILED:', e);
    process.exit(1);
  }
})();
