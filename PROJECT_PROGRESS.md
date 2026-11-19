# RescueMesh — progress notes

_Last updated: 2026-11-17_

## Scope (FYP spec, 2026-11-17)
Full system: Expo React Native mobile app (victim + responder), React/Tailwind dashboard, Express/Prisma backend,
offline-first sync, simulated LoRa mesh, docs. The earlier browser-only simulator prototype was moved to
`legacy/mesh-simulator-prototype/` (not part of the build).

## Verified (by command, this session)
- `npm run typecheck` — backend, dashboard, mobile: 0 errors.
- `npm test` — backend 23/23 (auth, RBAC, validation, SOS, sync, dedup, status flow, users, stats, settings,
  simulator, LoRa API incl. store-and-forward and frame size); mobile sync engine 8/8.
- `npm run test:integration` (mobile engine ↔ live API): offline queue → restart → sync → duplicate → responder
  resolve — passed.
- `npm run build` — backend tsc + dashboard Vite build OK.
- `npx expo export --platform android` — Metro bundled the mobile app (2.7 MB Hermes bundle).
- Dashboard API calls smoke-tested through the Vite proxy as admin (all 200; victim gets 403 on stats).

## Not verified by the assistant
- Mobile UI on a real phone/emulator (screens, GPS permission, SQLite persistence on device) — needs Expo Go run.
- Dashboard visual rendering in a browser (built and API-tested, not viewed).
- Physical LoRa hardware — not implemented by design (simulated, clearly labelled).

## Environment notes
- npm here intermittently fails with ECONNRESET; retry with `npm_config_fetch_retries=8`.
- npm 11 skips some install scripts (esbuild, @prisma/engines) — harmless so far; `prisma generate` runs in setup.
- Prisma blocks `db push --force-reset` when run by an AI agent; scripts avoid it (seed wipes data instead).
- Expo SDK 58 / RN 0.88 / React 19.3 in mobile; dashboard uses React 18.

## Possible next steps
- Push notifications for responders; WebSocket live updates instead of polling.
- Real ESP32 firmware + `SerialLoRaTransport` (see docs/LORA_INTEGRATION.md).
- Map view inside the mobile app (react-native-maps needs a dev build).
- Code-split the dashboard bundle (826 kB, warning only).
