// Thin fetch wrapper around the Maidora gateway API.
import { API_BASE_URL } from './theme';
import { kbOf } from './kycLog';

// KYC flow tracing — every /kyc and /media round trip logs under [KYC] (the
// same contract as [MPESA]), so a verification attempt reads as one story
// in the console: state fetch, draft saves, uploads (with payload size),
// submit. Payloads themselves are never logged — only their size.
const KYC_PATH = /^\/(kyc|media)(\/|$)/;
// Auth round trips log under [AUTH] — the same contract as [MPESA]/[KYC],
// so "login did nothing" style reports arrive with their own trail next to
// the [AUTH] state logs from AppContext/App.js.
const AUTH_PATH = /^\/auth(\/|$)/;

export class ApiError extends Error {
  constructor(message, status, code, field) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function request(path, { method = 'GET', body, token, timeoutMs = 20000 } = {}) {
  const reqT0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const kycTag = KYC_PATH.test(path)
    ? ` [${body?.dataBase64 ? kbOf(body.dataBase64) : method === 'POST' || method === 'PUT' ? 'json' : 'no-body'}]`
    : '';
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON response body
    }
    if (!res.ok) {
      throw new ApiError(
        (data && data.message) || `Request failed (${res.status})`,
        res.status,
        data && data.code,
        data && data.field
      );
    }
    // Payment-flow tracing — every M-Pesa request logs its round trip so the
    // owner can follow the whole journey in the Metro/console output.
    if (path.startsWith('/payments')) {
      console.log(`[MPESA] ${method} ${path} → ${res.status} in ${Date.now() - reqT0}ms`);
    }
    if (KYC_PATH.test(path)) {
      console.log(`[KYC]${kycTag} ${method} ${path} → ${res.status} in ${Date.now() - reqT0}ms`);
    }
    if (AUTH_PATH.test(path)) {
      console.log(`[AUTH] ${method} ${path} → ${res.status} in ${Date.now() - reqT0}ms`);
    }
    return data;
  } catch (e) {
    const msg = String((e && e.message) || '');
    const name = String((e && e.name) || '');
    if (path.startsWith('/payments')) {
      // Raw shape too — "fetch has been cancelled" style errors used to slip
      // past the friendly mapping; log exactly what the device produced.
      console.log(
        `[MPESA] ${method} ${path} ✗ ${Date.now() - reqT0}ms — name=${name} msg="${msg}" status=${e && e.status}`
      );
    }
    if (KYC_PATH.test(path)) {
      console.log(
        `[KYC]${kycTag} ${method} ${path} ✗ ${Date.now() - reqT0}ms — name=${name} msg="${msg}" status=${e && e.status}`
      );
    }
    if (AUTH_PATH.test(path)) {
      console.log(
        `[AUTH] ${method} ${path} ✗ ${Date.now() - reqT0}ms — name=${name} msg="${msg}" status=${e && e.status}`
      );
    }
    // The device's fetch rejects with different shapes for a cancelled call
    // (AbortError, or "fetch has been cancelled" / "aborted" in the message) —
    // ALL of them mean the same thing: WE gave up waiting, the request may
    // still have gone through. Never present that as a definite failure.
    if (name === 'AbortError' || /abort|cancel/i.test(msg)) {
      throw new ApiError(
        'This is taking longer than usual. Check your connection and try again.',
        0,
        'TIMEOUT'
      );
    }
    if (e instanceof TypeError || /network request failed|failed to fetch|the internet connection|offline|not connected|no address|unreachable/i.test(msg)) {
      throw new ApiError(
        'You seem to be offline. Check your Wi-Fi or mobile data, then try again.',
        0,
        'OFFLINE'
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // POST /auth/register — creates the account (no role yet), sends the 6-digit SMS OTP
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  // POST /auth/verify-otp — { userId, code } -> { token, user }
  verifyOtp: (payload) => request('/auth/verify-otp', { method: 'POST', body: payload }),
  // POST /auth/resend-otp — { userId }
  resendOtp: (payload) => request('/auth/resend-otp', { method: 'POST', body: payload }),
  // POST /auth/login — { identifier, password, location? }
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  // GET /auth/me — validates a stored token; returns a refreshed 30d token
  me: (token) => request('/auth/me', { token }),
  // POST /auth/onboarding — { role } chosen post-verification, immutable after
  onboarding: (role, token) =>
    request('/auth/onboarding', { method: 'POST', body: { role }, token }),
  // POST /auth/request-email-verification — optional email path (SMTP)
  requestEmailVerification: (token) =>
    request('/auth/request-email-verification', { method: 'POST', token }),
  // POST /auth/update-email — change email before verification (409 if taken)
  updateEmail: (email, token) =>
    request('/auth/update-email', { method: 'POST', body: { email }, token }),
  // POST /auth/verify-email — { code }
  verifyEmail: (code, token) =>
    request('/auth/verify-email', { method: 'POST', body: { code }, token }),

  // GET /profile — maid profile + derived completeness (§7)
  getProfile: (token) => request('/profile', { token }),
  // PUT /profile — upsert the completeness fields
  saveProfile: (payload, token) =>
    request('/profile', { method: 'PUT', body: payload, token }),

  // GET /payments/purposes — the §9 pricing table (labels + fixed prices,
  // editable server-side without an app release)
  paymentPurposes: (token) => request('/payments/purposes', { token }),
  // POST /payments/stk-push — { amount, phone?, purpose? } -> { paymentId, checkoutRequestId, message }
  mpesaStkPush: (payload, token) =>
    request('/payments/stk-push', { method: 'POST', body: payload, token, timeoutMs: 30000 }),
  // GET /payments/:id — status; refresh=1 live-queries Daraja while pending
  mpesaStatus: (id, token, refresh = false) =>
    request(`/payments/${id}${refresh ? '?refresh=1' : ''}`, { token }),
  // GET /payments — user's recent payments
  mpesaList: (token) => request('/payments', { token }),

  // GET /kyc — KYC state: status, rejection reason, urgent flag, draft fields
  kycGet: (token) => request('/kyc', { token }),
  // PUT /kyc/draft — autosave personal details / document type (debounced)
  kycSaveDraft: (patch, token) =>
    request('/kyc/draft', { method: 'PUT', body: patch, token }),
  // POST /kyc/images — legacy image upload (kept for compatibility; the app
  // now uses the media pipeline below)
  kycUploadImage: (field, dataBase64, mime, token) =>
    request('/kyc/images', {
      method: 'POST',
      body: { field, dataBase64, mime },
      token,
      timeoutMs: 60000,
    }),
  // POST /media/kyc/:field — WebP-first KYC document upload (media.maidora.co.ke)
  mediaKycUpload: (field, dataBase64, mime, token) =>
    request(`/media/kyc/${field}`, {
      method: 'POST',
      body: { dataBase64, mime },
      token,
      timeoutMs: 60000,
    }),
  // POST /media/avatar — profile photo upload (public media.maidora.co.ke URL)
  uploadAvatar: (dataBase64, mime, token) =>
    request('/media/avatar', {
      method: 'POST',
      body: { dataBase64, mime },
      token,
      timeoutMs: 60000,
    }),
  // POST /kyc/submit — completeness validated server-side; §5 gate applies
  kycSubmit: (token) => request('/kyc/submit', { method: 'POST', token, timeoutMs: 30000 }),
  // GET /kyc/images/:field?format=base64 — the caller's own stored KYC image
  // as { ok, mime, dataBase64 }. The app renders it as a data URI because
  // header-authed <Image> sources fail silently on device (blank thumbnails
  // after a restart). Gets [KYC] round-trip logging like every other call.
  kycImageFetch: (field, token) =>
    request(`/kyc/images/${field}?format=base64`, { token, timeoutMs: 30000 }),

  // ─── Marketplace (unified spec §9/§10/§15.1) ────────────────────────────
  // GET /maids — search + filters (§10 decay applied server-side).
  maids: (params, token) => request(`/maids${qs(params)}`, { token }),
  // GET /maids/:id — public profile (no contact details).
  maidProfile: (id, token) => request(`/maids/${id}`, { token }),

  // POST /jobs — employer posts a job (verified gate).
  postJob: (payload, token) => request('/jobs', { method: 'POST', body: payload, token }),
  // GET /jobs — open jobs feed (q, county, job_type, page).
  jobs: (params, token) => request(`/jobs${qs(params)}`, { token }),
  // GET /jobs/mine — the employer's own postings.
  myJobs: (token) => request('/jobs/mine', { token }),
  // GET /jobs/:id — detail (+ applications when the caller owns the job).
  jobDetail: (id, token) => request(`/jobs/${id}`, { token }),
  // PATCH /jobs/:id — edit fields / open|close.
  updateJob: (id, payload, token) =>
    request(`/jobs/${id}`, { method: 'PATCH', body: payload, token }),
  // POST /jobs/:id/apply — §9: 2 lifetime free, then 402 paywall_required.
  applyToJob: (id, message, token) =>
    request(`/jobs/${id}/apply`, { method: 'POST', body: { message }, token }),
  // GET /applications — role-aware list (+ creditsLeft for househelp).
  applications: (token) => request('/applications', { token }),
  // PATCH /applications/:id — employer accept|reject · maid withdraw.
  updateApplication: (id, status, token) =>
    request(`/applications/${id}`, { method: 'PATCH', body: { status }, token }),

  // POST /chat/threads — {peerId} → {threadId} (find-or-create, verified gate).
  chatStart: (peerId, token) =>
    request('/chat/threads', { method: 'POST', body: { peerId }, token }),
  // GET /chat/threads — inbox with unread counts.
  chatThreads: (token) => request('/chat/threads', { token }),
  // GET /chat/threads/:id/messages?after= — incremental fetch (marks seen).
  chatMessages: (threadId, after, token) =>
    request(`/chat/threads/${threadId}/messages${after ? `?after=${after}` : ''}`, { token }),
  // POST /chat/threads/:id/messages — {body}.
  chatSend: (threadId, body, token) =>
    request(`/chat/threads/${threadId}/messages`, { method: 'POST', body: { body }, token }),
};

// Minimal query-string builder — skips null/undefined/'' values.
function qs(params = {}) {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}
