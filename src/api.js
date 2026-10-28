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
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new ApiError(
        'The request timed out. Please check your connection and try again.',
        0,
        'TIMEOUT'
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // POST /auth/register — creates the account, sends the 6-digit SMS OTP
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  // POST /auth/verify-otp — { userId, code } -> { token, user }
  verifyOtp: (payload) => request('/auth/verify-otp', { method: 'POST', body: payload }),
  // POST /auth/resend-otp — { userId }
  resendOtp: (payload) => request('/auth/resend-otp', { method: 'POST', body: payload }),
  // POST /auth/login — { identifier, password }
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  // GET /auth/me — validates a stored token
  me: (token) => request('/auth/me', { token }),
};
