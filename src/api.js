// Thin fetch wrapper around the Maidora gateway API.
import { API_BASE_URL } from './theme';

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
  // POST /kyc/images — { field, dataBase64, mime } (base64 JSON; big body)
  kycUploadImage: (field, dataBase64, mime, token) =>
    request('/kyc/images', {
      method: 'POST',
      body: { field, dataBase64, mime },
      token,
      timeoutMs: 60000,
    }),
  // POST /kyc/submit — completeness validated server-side; §5 gate applies
  kycSubmit: (token) => request('/kyc/submit', { method: 'POST', token, timeoutMs: 30000 }),
};
