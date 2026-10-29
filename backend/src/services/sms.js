// TalkSasa SMS gateway client (API v3).
const config = require('../config');

const API_URL = config.sms.apiUrl;
const TOKEN = config.sms.token;
const SENDER_ID = config.sms.senderId;

/**
 * Send a single SMS. `recipient` is E.164-ish (+2547XXXXXXXX or 2547XXXXXXXX).
 * Resolves with the provider payload; throws Error with .provider on failure.
 */
async function sendSms(recipient, message) {
  if (!TOKEN) throw new Error('SMS_API_TOKEN is not configured');
  const msisdn = String(recipient).replace(/^\+/, '');
  let res;
  try {
    res = await fetch(`${API_URL}/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        recipient: msisdn,
        sender_id: SENDER_ID,
        type: 'plain',
        message,
      }),
    });
  } catch (e) {
    const err = new Error(`SMS provider unreachable: ${e.message}`);
    err.provider = null;
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }

  if (!res.ok || (data && data.status === 'error')) {
    const err = new Error((data && data.message) || `SMS provider error (HTTP ${res.status})`);
    err.provider = data;
    throw err;
  }
  return data;
}

module.exports = { sendSms };
