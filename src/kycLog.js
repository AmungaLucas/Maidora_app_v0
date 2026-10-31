// KYC flow tracing — one readable story per verification attempt in the
// Metro / console output, same contract as the [MPESA] payment traces.
//
// A SESSION starts when the user taps "Continue verification" on the intro
// screen (kycStart). Every event after that — screen entries, permission
// results, shutter presses, frame crops, gallery picks, uploads, submit —
// is stamped with the session id + elapsed seconds, so a single device run
// reads like a timeline:
//
//   [KYC] ── FLOW START K3XQ · 14:02:11 ── Continue verification pressed · status=draft
//   [KYC K3XQ +0.2s] step 1 · personal details (dob=2002-03-12 gender=female)
//   [KYC] PUT /kyc/draft → 200 in 213ms
//   [KYC K3XQ +12.4s] shot ready · id_front image/webp 214KB → upload
//   [KYC] POST /media/kyc/id_front → 200 in 1823ms (216KB)
//
// Events before a session exists (intro preload, avatar captures) still log
// under the plain [KYC] tag with no clock. Never log base64 payloads — only
// their size (kbOf).
let sid = '';
let t0 = null;

const pad = (n) => String(n).padStart(2, '0');

function clock() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Start a fresh trace session — call from the "Continue verification" press.
export function kycStart(label) {
  sid = Math.random().toString(36).slice(2, 6).toUpperCase();
  t0 = Date.now();
  console.log(`[KYC] ── FLOW START ${sid} · ${clock()} ── ${label}`);
}

// Breadcrumb. With a session: "[KYC K3XQ +12.4s] …", without: "[KYC] …".
export function kycLog(msg) {
  const dt = t0 ? `${((Date.now() - t0) / 1000).toFixed(1)}s` : '·';
  console.log(`[KYC${sid ? ` ${sid}` : ''} +${dt}] ${msg}`);
}

// base64 → KB estimate (decoded bytes ≈ len × 3/4). Used so upload sizes
// appear in the trace without ever dumping the payload itself.
export function kbOf(base64) {
  return base64 ? `${Math.round((base64.length * 3) / 4 / 1024)}KB` : '0KB';
}
