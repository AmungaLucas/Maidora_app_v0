# Maidora Kenya gateway (backend)

Express API deployed at `https://gateway.maidora.co.ke` — cPanel/LiteSpeed
Node.js 24, app root `/home/maidorac/maidora_app`. This folder is the source
of truth for the server; deploy by mirroring it to the app root (`.env` is
server-only, never committed — see `.env.example`).

## Layout

```
app.js                  entry — mounts routers, 404 + error handler
src/config/index.js     env loading (dotenv) + typed config sections
src/config/db.js        MySQL pool (lazy)
src/routes/health.js    /api/health (stable external contract), /api/db-health
src/routes/auth.js      /api/auth/register|verify-otp|resend-otp|login|me
src/routes/payments.js  /api/payments/stk-push|:id|callback + /api/payments
src/services/otp.js     hashed OTP storage, cooldown/hourly/attempt caps, SMS template
src/services/sms.js     TalkSasa SMS client (API v3)
src/services/mpesa.js   Safaricom Daraja — OAuth cache, STK Push, STK Query
src/middleware/auth.js  requireAuth (JWT Bearer, 30d tokens)
src/utils/validate.js   validation — mirrors the mobile app's src/validation.js
sql/schema.sql          users, phone_otps, payments (idempotent)
```

## Notes

- Roles are immutable after account creation: no endpoint reads a role from a
  request body for updates. JWT carries `{uid, role}`.
- OTPs are SHA-256 hashed (`sha256(userId:code)`), 10-minute TTL, 60s resend
  cooldown, 5/hour cap, 5 wrong attempts max.
- M-Pesa STK Push is LIVE (Daraja production). `MPESA_CALLBACK_URL` should
  point at this deployment (`https://gateway.maidora.co.ke/api/payments/callback`);
  `GET /api/payments/:id?refresh=1` polls Daraja as a callback-miss fallback.
- OTP SMS: when `OTP_APP_HASH` is set (11-char Android SMS Retriever hash from
  `expo-otp-autofill.getAppHashAsync()`), it is appended to the message so the
  Android app can auto-fill the code.

## Local run

```bash
cp .env.example .env   # fill in real values
npm install
node app.js            # listens on PORT
curl localhost:$PORT/api/health
```
