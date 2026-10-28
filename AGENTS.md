# Maidora Kenya — mobile app

Expo / React Native app for the Maidora Kenya two-sided marketplace
("Trusted help for your household"), connecting households with house helps
across Kenya. Brand palette: forest `#214E3B`, green `#7BC08B`, cream `#F7F3E9`.

## Stack decisions (do not violate)

- **Navigation: React Navigation** (`@react-navigation/native` + `@react-navigation/native-stack`).
  We do NOT use expo-router file-based routing. Screens live in `src/screens/`,
  the navigator and auth/onboarding gate live in `App.js`.
- Expo SDK 58, React Native 0.88, React 19.3. No `ios/`/`android/` folders
  (Continuous Native Generation) — never create or edit them by hand; configure
  via `app.json` and config plugins.
- State: React Context (`src/context/AppContext.js`) + AsyncStorage
  (`src/storage.js`). No Redux/Zustand unless the team agrees first.
- API: `src/api.js` talks to `https://gateway.maidora.co.ke/api` (the Node.js
  gateway deployed on cPanel; see below).

## Commands

```bash
npx expo install <package>   # ALWAYS use instead of npm add — resolves SDK-compatible versions
npx expo start               # start the dev server (Expo Go on your phone)
npx expo lint                # lint
npx expo-doctor              # diagnose dependency/config issues
npx expo install --fix       # fix incompatible package versions
```

Expo changes every SDK release — do not trust memory over the versioned docs:
https://docs.expo.dev/versions/v58.0.0/

## App flow (implemented)

First install: Splash → Welcome → RoleSelect (Employer/Househelp) →
Signup → OTP (SMS, 6 digits) → role-based Home.

Later launches: Splash → gate on stored state — signed in → Home; not signed
in → Login; onboarding incomplete → Welcome; pending OTP registration → OTP.

### Rules baked into the code — keep them true

- **Role is immutable after account creation.** No endpoint accepts a role
  update; the only client surface is Settings → "Change my role" → explainer
  sheet → manual review by the team.
- Role before signup is a free param: RoleSelect pre-selects `currentRole`
  when reached from the Signup "Change" link (chip: "Signing up as: X · Change").
- Signup validation mirrors the server exactly (see `src/validation.js` vs
  gateway `src/validate.js`): password ≥ 8 chars, valid email, Kenyan phone
  (`07…`, `01…`, `+2547…`, `+2541…` → normalized to `+2547…`/`+2541…`).
- The pending `userId` from `POST /auth/register` is persisted
  (`@maidora/pendingRegistration`) so the OTP screen survives app restarts.
- Primary buttons stay disabled until the form is valid — no dead-end API errors.
- Referral entry is a collapsed text link ("Have a referral code?").
- Terms/Privacy links sit directly above the Create Account button.

## Backend (gateway)

Deployed at `https://gateway.maidora.co.ke` (Node.js 24 on cPanel/LiteSpeed,
app root `/home/maidorac/maidora_app` on server19.tela-host.com). Endpoints:
`/api/health`, `/api/db-health`, `/api/auth/register|verify-otp|resend-otp|login|me`.
SMS OTP via TalkSasa (`bulksms.talksasa.com/api/v3`). Password-reset email via
nodemailer is planned (credentials pending) — the Forgot Password screen is a
placeholder until then.

## Conventions

- EAS for builds (`npx eas-cli`); OTA updates via `eas update` later.
- After adding a library with native code, a development build is required:
  `npx expo run:android|ios` or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries.
- Brand tokens live in `src/theme.js` — never hardcode hex values in screens.
