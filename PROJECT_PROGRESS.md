# RescueMesh — progress notes

_Last updated: 2026-11-19_

## Status
Working end-to-end FYP system: Expo mobile app (victim + responder), React dashboard, Express/Prisma backend,
offline-first sync, simulated LoRa mesh, docs. On GitHub: https://github.com/adnankhalil22/RescueMesh

## 2026-11-19 — final pre-hardware pass (AUDIT_REPORT.md §10)
- Demo moved to **Beirut, Lebanon** (flood along the Beirut River). Scenario in `backend/prisma/demoScenario.ts`,
  verified by `backend/tests/scenario.test.ts`; map centre 33.884, 35.528, zoom 13.
- Pre-demo checks: `npx tsx backend/scripts/verify-demo-data.ts`, `npx tsx backend/scripts/check-topology.ts`.
- All required checks executed and passing: typecheck, backend 37/37, mobile 8/8, build, integration 6/6, UI 6/6,
  expo-doctor 20/20, Android export.

## 2026-11-19 — technical audit
See **AUDIT_REPORT.md**. 11 defects found and fixed, each with a regression test:
- Security: location hijack of mesh requests (B1), request-ID reuse / status leak (B2), no login throttling (B3),
  no security headers (B4).
- Data: future timestamps (B5), late SOS mislabelled online (B6), held packets stuck by an old hop limit (B7).
- Mobile: missing `expo-font` (B8) and `expo-asset` (B9), GPS timer leak / no stale fallback / no settings link (B10),
  accessibility labels (B11).
- Dashboard: map no longer re-zooms on refresh; deactivated users are signed out with a message.
- New mobile UI test suite (`mobile/ui-tests`, Jest + RN Testing Library) driving the real screens against the live API.

## Verified (2026-11-19, by command)
typecheck (all) ✔ · backend tests 37/37 ✔ · mobile unit 8/8 ✔ · mobile UI 6/6 ✔ · integration 6/6 ✔ ·
builds ✔ · expo-doctor 20/20 ✔ · Android bundle ✔ · demo-data consistency 13/13 ✔

## Not verified by the assistant
- App on a physical phone (UI tests use simulated GPS/network/SQLite bridge).
- Dashboard visual layout in a browser.
- LoRa hardware (not implemented; simulation only, clearly labelled).

## Environment notes
- npm here intermittently fails with ECONNRESET; retry with `npm_config_fetch_retries=8`.
- `npx expo install X -- --save-dev` put packages in `dependencies`; check package.json afterwards.
- Prisma blocks `db push --force-reset` when run by an AI agent; scripts avoid it (seed wipes data instead).
- PowerShell execution policy was set to RemoteSigned (CurrentUser) so `npm` works in VS Code terminals.
- Mobile UI tests need the backend running on :4000 with seed data; re-seed afterwards (`npm run seed`).

## Next steps
See AUDIT_REPORT.md §7: SOS without coordinates, push notifications, token hardening, pagination, CI, hardware phase.
