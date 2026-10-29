# Maidora Kenya

Trusted help for your household. A two-sided marketplace connecting households
with maids / house helps across Kenya.

This repo is the **mobile app** (Expo / React Native, SDK 58, React Navigation).
The **API gateway** runs separately at `https://gateway.maidora.co.ke`.

## Quick start

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android/iOS) to run on your phone.

## Flow

Splash → Welcome → Role select (Employer / Househelp) → Signup (+ location
capture, referral code) → SMS OTP verification → role-based home.
Later launches go straight to Home (signed in) or Login.

## Conventions

- Navigation: React Navigation native-stack (`App.js`, screens in `src/screens/`).
- Validation rules are mirrored between `src/validation.js` and the gateway.
- Brand tokens in `src/theme.js`. See `AGENTS.md` for the full rulebook.
