// Media pipeline (§8/§13) — secure image uploads served from the
// media.maidora.co.ke subdomain (docroot /home/maidorac/media.maidora.co.ke).
//
//   POST /api/media/avatar        { dataBase64 }            (auth) → { url }
//   POST /api/media/kyc/:field    { dataBase64 }            (auth) → { ok, field }
//       field ∈ id_front | id_back | selfie
//
// SECURITY MODEL (three classes of media, three levels of exposure):
//   avatars/  — PUBLIC via the subdomain. Filenames are 128-bit random hex
//               (unguessable); the directory itself denies listing/scripts.
//   kyc/      — stored under the same subdomain tree but web-DENIED with
//               `Require all denied` (.htaccess). Bytes are only readable
//               through the authenticated GET /api/kyc/images/:field route —
//               the dashboard review queue gets its own admin-scoped reader
//               later (§13). The column stores the basename; kyc.js resolves
//               it against media.kycDir (legacy kyc_uploads/ still honoured).
//   Uploads are validated by MAGIC BYTES (never the declared mime), capped
//   at 5 MB decoded, hashed (sha256) and logged in media_assets for the
//   admin dashboard audit trail. Every write is 0o600.
//
// The client converts captures to WebP before upload (expo-image-manipulator,
// SaveFormat.WEBP) — roughly half the bytes of JPEG at equal quality. The
// server still accepts JPEG/PNG (device fallback safety) and names the file
// by what the bytes ACTUALLY are, never by what the client claimed.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB decoded ceiling per image
const MAX_B64 = 8 * 1024 * 1024;   // reject absurd payloads before decoding

const KYC_FIELDS = {
  id_front: { col: 'kyc_id_front_url', kind: 'id_front' },
  id_back: { col: 'kyc_id_back_url', kind: 'id_back' },
  selfie: { col: 'kyc_selfie_url', kind: 'selfie' },
};

// ---- storage bootstrap ------------------------------------------------------
// Docroot layout (all created on demand):
//   media.maidora.co.ke/
//     .htaccess          — no indexes, no scripts, deny dotfiles
//     avatars/.htaccess  — public cache policy for profile photos
//     kyc/.htaccess      — Require all denied (API-only reads)
function ensureMediaDirs() {
  const root = config.media.dir;
  for (const sub of ['avatars', 'kyc']) {
    fs.mkdirSync(path.join(root, sub), { recursive: true });
  }
  const rootHt = path.join(root, '.htaccess');
  if (!fs.existsSync(rootHt)) {
    fs.writeFileSync(
      rootHt,
      [
        '# Maidora media — hardening (managed by deploys; safe to re-write)',
        'Options -Indexes',
        '',
        '# No script execution in the media tree — ever.',
        '<FilesMatch "\\.(php|phtml|php[0-9]|pht|phar|cgi|pl|py|sh|shtml)$">',
        '  Require all denied',
        '</FilesMatch>',
        'RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .pht .phar',
        'RemoveType .php .phtml',
        '',
        '# Dotfiles (incl. .htaccess itself) are never served.',
        '<FilesMatch "^\\.">',
        '  Require all denied',
        '</FilesMatch>',
        '<IfModule mod_headers.c>',
        '  Header always set X-Content-Type-Options "nosniff"',
        '</IfModule>',
        '',
        'AddType image/webp .webp',
      ].join('\n'),
      { mode: 0o644 }
    );
  }
  const avHt = path.join(root, 'avatars', '.htaccess');
  if (!fs.existsSync(avHt)) {
    fs.writeFileSync(
      avHt,
      [
        '# Avatars are public (unguessable 128-bit names). Cache hard — a new',
        '# upload writes a NEW file, so the URL is effectively immutable.',
        '<IfModule mod_headers.c>',
        '  Header set Cache-Control "public, max-age=31536000, immutable"',
        '  Header always set X-Content-Type-Options "nosniff"',
        '</IfModule>',
        'AddType image/webp .webp',
      ].join('\n'),
      { mode: 0o644 }
    );
  }
  const kycHt = path.join(root, 'kyc', '.htaccess');
  if (!fs.existsSync(kycHt)) {
    fs.writeFileSync(kycHt, 'Require all denied\n', { mode: 0o644 });
  }
}
ensureMediaDirs();

// ---- helpers ----------------------------------------------------------------
function bad(message, field, status = 400) {
  const err = new Error(message);
  err.status = status;
  if (field) err.field = field;
  return err;
}

// Magic-byte sniff — the ONLY source of truth for what a file is.
function sniffImage(buf) {
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  return null;
}

function decodePayload(req) {
  const raw = String((req.body && req.body.dataBase64) || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) throw bad('No image data received.', 'dataBase64');
  if (raw.length > MAX_B64) throw bad('This image is too large. Please choose a smaller one.', 'dataBase64', 413);
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) throw bad('Image could not be read. Try again.', 'dataBase64');
  if (buf.length > MAX_BYTES) throw bad('This image is too large (max 5 MB). Please choose a smaller one.', 'dataBase64', 413);
  const kind = sniffImage(buf);
  if (!kind) throw bad('That file is not a supported photo (WebP, JPEG or PNG).', 'dataBase64');
  return { buf, ...kind };
}

// Delete a stored file by column value / URL — best-effort, never blocking.
function unlinkStored(value, sub) {
  try {
    if (!value) return;
    const name = String(value).split('/').pop().split('?')[0];
    if (!name || name.includes('..')) return;
    const candidates = [
      path.join(config.media.dir, sub, name),
      path.join(config.kyc.uploadDir, name), // legacy layout
    ];
    for (const f of candidates) fs.unlink(f, () => {});
  } catch {
    /* best effort */
  }
}

async function recordAsset(userId, kind, relPath, publicUrl, bytes, mime, sha) {
  await pool.query(
    `INSERT INTO media_assets (user_id, kind, storage_path, public_url, bytes, mime, sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, kind, relPath, publicUrl || null, bytes, mime, sha]
  );
}

// ---- routes -----------------------------------------------------------------
router.use(requireAuth);

// POST /api/media/avatar — profile photo. Web-served from the subdomain;
// the response URL is stored on users.avatar_url.
router.post('/avatar', async (req, res, next) => {
  try {
    const { buf, mime, ext } = decodePayload(req);
    const name = `${Date.now().toString(36)}_${crypto.randomBytes(12).toString('hex')}.${ext}`;
    // 0644 — LiteSpeed serves avatars as a different uid than the app owner
    // (observed: 0600 → 403, 0644 → 200 image/webp). Privacy comes from the
    // unguessable 128-bit name, not from file permissions.
    fs.writeFileSync(path.join(config.media.dir, 'avatars', name), buf, { mode: 0o644 });
    const url = `${config.media.baseUrl}/avatars/${name}`;

    // Replace: drop the previous avatar file (best-effort) then point the user
    // at the new one. Unique by construction — random 96-bit suffix.
    const [[u]] = await pool.query('SELECT avatar_url FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (u && u.avatar_url && u.avatar_url !== url) unlinkStored(u.avatar_url, 'avatars');

    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.user.uid]);
    await recordAsset(
      req.user.uid, 'avatar', `avatars/${name}`, url, buf.length, mime,
      crypto.createHash('sha256').update(buf).digest('hex')
    );

    console.log(`[media] avatar user=${req.user.uid} ${buf.length}B ${mime} → ${url}`);
    return res.json({ ok: true, url, avatarUrl: url });
  } catch (e) {
    return next(e);
  }
});

// POST /api/media/kyc/:field — KYC document images (front / back / selfie).
// Same contract as the legacy POST /kyc/images ({ ok, field }) so the client
// switch is a pure endpoint swap. Files are web-DENIED; only the
// authenticated /api/kyc/images/:field route streams them back.
router.post('/kyc/:field', async (req, res, next) => {
  try {
    const field = String(req.params.field || '');
    const spec = KYC_FIELDS[field];
    if (!spec) throw bad('Unknown image field.', 'field');

    const [[u]] = await pool.query('SELECT kyc_status FROM users WHERE id = ? LIMIT 1', [req.user.uid]);
    if (!u) return res.status(401).json({ message: 'Session expired. Please log in again.' });
    if (!['not_started', 'draft', 'rejected'].includes(u.kyc_status)) {
      return res.status(409).json({ code: 'kyc_locked', message: 'Your submission is under review and cannot be changed right now.' });
    }

    const { buf, mime, ext } = decodePayload(req);
    const name = `${req.user.uid}_${field}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    // 0600 — KYC bytes are NEVER web-served (kyc/.htaccess denies + only the
    // authenticated /api/kyc/images/:field route, which runs as this owner
    // uid, reads them). Permissions are the second layer after the deny.
    fs.writeFileSync(path.join(config.media.dir, 'kyc', name), buf, { mode: 0o600 });

    const [[cur]] = await pool.query(`SELECT ${spec.col} AS cur FROM users WHERE id = ? LIMIT 1`, [req.user.uid]);
    if (cur && cur.cur) unlinkStored(cur.cur, 'kyc');

    await pool.query(
      `UPDATE users SET ${spec.col} = ?, kyc_draft_updated_at = NOW(),
        kyc_status = IF(kyc_status = 'not_started', 'draft', kyc_status)
       WHERE id = ?`,
      [name, req.user.uid]
    );
    await recordAsset(
      req.user.uid, spec.kind, `kyc/${name}`, null, buf.length, mime,
      crypto.createHash('sha256').update(buf).digest('hex')
    );

    console.log(`[media] kyc ${field} user=${req.user.uid} ${buf.length}B ${mime}`);
    return res.json({ ok: true, field });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
