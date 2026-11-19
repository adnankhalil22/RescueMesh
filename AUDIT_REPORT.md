# RescueMesh — Technical Audit Report

**Date:** 19 November 2026 · **Commit audited:** `9e3b74e` (identical to `origin/main` on GitHub at the start of the audit)
**Scope:** mobile app, backend API, dashboard, Prisma schema, authentication/authorization, offline storage and sync,
simulated LoRa, documentation.

> **Latest status:** see [§10 Final pre-hardware verification](#10-final-pre-hardware-verification-19-november-2026).
> Its test results replace those in §1 and §8.

## 1. Summary

The project was already in a working state: all type checks, 31 unit tests, the builds and a live integration test
passed before any change. The audit found **11 defects** (2 security, 4 data-integrity/reliability, 2 missing
dependencies, 3 usability/accessibility) and a set of weaknesses that are acceptable for an FYP demonstration but
should be documented. All 11 defects were fixed, and each fix is covered by a new automated test.

The largest gap before the audit was that **the mobile screens had never been executed**: only type checks and a
bundle build existed. A UI integration suite now renders the real app, taps through the critical flows and talks to
the real backend. It found two of the defects listed below. It runs on a simulated device (see §6), so a check on a
physical phone is still required before the demonstration.

| | Before audit | After audit |
|---|---|---|
| Type checks (backend, dashboard, mobile app, mobile tests) | pass | pass |
| Backend tests | 23 / 23 | **30 / 30** (+7 audit regression tests) |
| Mobile sync-engine unit tests | 8 / 8 | 8 / 8 |
| Mobile UI integration tests | none | **6 / 6** |
| Live end-to-end integration script | 6 / 6 checks | 6 / 6 checks |
| Dashboard production build / backend compile | pass | pass |
| Android JS bundle (`expo export`) | pass | pass |
| `expo-doctor` | 19 / 20 (missing peer dependency) | **20 / 20** |
| Security probes against the running API (§5) | 6 problems | 0 problems |

## 2. Method

1. Confirmed the local copy equals the GitHub repository.
2. Ran every existing check (type checks, unit tests, builds, `expo-doctor`, live integration script).
3. Read every module, with particular attention to authorization, input validation, the sync engine and location
   handling.
4. Wrote probes that attack the running API (ownership checks, brute force, malformed input, clock skew).
5. Searched the dashboard and mobile code for hardcoded or mock data.
6. Built a UI test harness for the mobile app and drove the real screens end to end.
7. Fixed each confirmed problem, added a regression test, and re-ran everything.

## 3. Completed features (verified)

"Verified" means exercised by an automated test or probe in this audit, not just present in the code.

### Backend
| Feature | Evidence |
|---|---|
| Registration, login, bcrypt hashing, JWT, `/auth/me`, change password | `api.test.ts` |
| Role-based access (VICTIM / RESPONDER / ADMIN), victims limited to own data | `api.test.ts`, probes 7a/7b |
| SOS create, list (search, type/priority/status filters, sorting), detail with history | `api.test.ts` |
| Status workflow with transition rules, accept/assign, cancel by victim, archive/delete by admin | `api.test.ts`, UI test 3 |
| Idempotent offline sync endpoint, duplicate prevention by message ID and request ID | `api.test.ts`, `audit.test.ts` A2, integration script |
| Statistics computed from the database (no hardcoded values) | `api.test.ts` |
| User management (roles, activation; deactivated tokens rejected immediately) | `api.test.ts` |
| System settings with validation | `api.test.ts`, `audit.test.ts` A7 |
| Simulated LoRa: multi-hop, hop count, duplicate suppression in loops, hop limit, store-and-forward, frame size ≤ 222 B | `mesh.test.ts`, `audit.test.ts` A7 |

### Mobile (verified in the UI test suite, simulated device; see §6)
| Feature | Evidence |
|---|---|
| Splash → login → role-based navigation (victim tabs / responder tabs) | UI tests 1, 3 |
| Registration creates a working account | UI test 5 |
| SOS: GPS fix, category, auto-priority, description, send, delivery status reaching DELIVERED | UI test 1 |
| SOS appears on the server with the phone's coordinates (what the dashboard displays) | UI test 1 |
| Responder update (dashboard/API) shown on the victim's request screen | UI test 1 |
| Offline: connection indicator, SOS saved and QUEUED, nothing reaches the server | UI test 2 |
| Restart: database closed and re-opened, session and queued SOS restored | UI test 2 |
| Automatic sync when the network returns; server marks it OFFLINE_SYNC | UI test 2, integration script |
| Responder: incoming list → accept → in progress → resolved | UI test 3 |
| Blocked GPS permission: SOS disabled, "Open phone settings" offered | UI test 4 |
| My Requests, My Location, Profile, Settings screens render with real data | UI test 5 |
| Sync engine: back-off, crash-mid-upload recovery, FAILED handling, SOS-first ordering, expired session | `syncEngine.test.ts` |

### Dashboard
| Feature | Evidence |
|---|---|
| Every page's API call returns real data for admin; victim is refused | API smoke test through the Vite proxy |
| No hardcoded or mock statistics | Source search: none found; all figures come from `/stats/overview`, `/comm/status`, `/emergencies` |
| Production build | `npm run build` |

## 4. Incomplete features

| Item | Status |
|---|---|
| **Physical ESP32 + LoRa communication** | Not implemented and not tested. It needs hardware. The packet format, compact on-air encoding, routing rules and transport interfaces exist and are tested in simulation. `SerialLoRaTransport` (backend) and `LoRaBridgeTransport` (mobile) refuse to send. The dashboard labels all mesh data "Simulated". |
| Sending an SOS when no location can be obtained at all | Not possible: the backend requires coordinates. The app now falls back to any last-known position (marked as stale), but a phone with GPS off and no history cannot send. |
| Push notifications to responders | Not implemented. Responders' app and dashboard poll every 5–10 s. |
| Admin password reset / account deletion | Not implemented. Admins can change roles and deactivate accounts. |
| Real-time dashboard (WebSockets) | Polling is used instead (interval configurable in Settings). |
| `STATUS`, `ACK`, `CHAT` message types | Accepted and stored by the server, but no UI uses them yet. |
| Map inside the mobile app | Not implemented (would need a development build for `react-native-maps`). The app opens the phone's maps app instead. |

## 5. Bugs found and fixed

| # | Severity | Area | Problem (how it was found) | Fix | Regression test |
|---|---|---|---|---|---|
| B1 | **High** (security) | Sync | Any signed-in user could change the location of an SOS that arrived via the mesh, because those requests have no owner (probe 1). | Over HTTP only the reporter may update a request's location; requests with no owner are refused. | `audit.test.ts` A1 |
| B2 | **High** (security) | Sync | A user could submit a message reusing another person's request ID. It was accepted and revealed that request's status (probe 2). Replaying someone else's message ID also revealed the status. | Request IDs owned by another account are rejected; duplicate replies only include status for the owner. | A2 |
| B3 | Medium (security) | Auth | No protection against password guessing: unlimited login attempts (probe 3). | After 8 failed attempts per email+IP within 15 min, returns 429 with `Retry-After`; success resets the count. | A3 |
| B4 | Low (security) | API | No security headers (probe 4). | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` set on every response. | A4 |
| B5 | Medium (data) | Sync | Device timestamps in the future (wrong phone clock) were stored as-is, corrupting ordering and daily statistics (probe 5c). | Timestamps more than 5 min ahead are replaced by server time; the SOS is still accepted (never lose an SOS). | A5 |
| B6 | Medium (data) | Sync | An SOS delayed by connectivity was labelled "Online" if the phone believed it was online when the SOS was created (probe 6). | Requests delivered more than 2 min after creation are labelled `OFFLINE_SYNC`. | A6 |
| B7 | Medium (reliability) | LoRa sim | A packet stopped by the hop limit stayed pending forever, even after the limit was raised, because retries reused the old limit. | Retries use the current setting; changing max hops triggers a retry. | A7 |
| B8 | **High** (build) | Mobile | Missing peer dependency `expo-font`, required by every icon (`expo-doctor`). Works in Expo Go; a standalone build could crash. | Installed with `npx expo install` (SDK-matched). | `expo-doctor` 20/20 |
| B9 | **High** (build) | Mobile | `expo-font` needs `expo-asset`, also missing. Found only by the new UI tests; `expo-doctor` did not report it. | Installed with `npx expo install`. | UI tests, Android bundle |
| B10 | Medium (UX) | Mobile GPS | (a) The GPS timeout timer was never cleared, so a "Possible unhandled promise rejection" warning would appear in Expo Go during demos. (b) Without a fix in the last 10 min, the SOS could not be sent even if an older position existed. (c) A permanently blocked permission gave no way out. | Timer cleared; third fallback to any last-known position (shown with its age, labelled stale); "Open phone settings" button when blocked or GPS off. | UI test 4 |
| B11 | Low (accessibility) | Mobile | Form fields had no accessibility label. Icon buttons were announced with the icon's font glyph in their name, so a screen reader would read a stray character before "SEND SOS". (Found by the UI tests.) | Fields labelled from their visible label; buttons labelled with their title. | UI tests |

Smaller fixes in the same pass:
- **Dashboard Live Map:** re-zoomed whenever a new SOS arrived, discarding the operator's view. It now fits once, with a "Fit all markers" button.
- **Dashboard sign-out:** a deactivated account now signs out with an explanation, instead of showing errors.
- **Mobile database:** a failed first open was cached forever; it can now retry.
- **Mobile Location screen:** a load error is now handled.
- **Mobile `package.json`:** test tools were listed under `dependencies`; they are now `devDependencies`.

Found to work correctly in the probes: coordinate range validation, the 1000-character description limit, the
100-message batch limit, malformed JSON (400), and victims blocked from user listings and other users' profiles.

## 6. Technical weaknesses (remaining, acceptable for the demonstration)

**Security**
- The JWT is stored in `localStorage` on the dashboard, so it is readable by any script injected into the page. Tokens
  live 30 days and are not revoked by a password change (only by deactivation).
- The demo runs over plain HTTP on the local network, so tokens and data travel unencrypted on that Wi-Fi. Production
  needs HTTPS.
- `CORS_ORIGIN=*` by default.
- The login limiter is in memory: it resets when the server restarts and is not shared between server instances.
- Any responder can update a request assigned to another responder (a deliberate choice for an operations centre).

**Scalability**
- Statistics load all requests into memory.
- The emergency list returns at most 500 rows, without pagination.
- The simulator's in-memory "seen" cache grows without limit, and its transmission log is lost on restart.
- SQLite is fine for the demo. The schema is PostgreSQL-ready, but PostgreSQL was not tested.

**Testing and verification gaps**
- Mobile UI tests run in Jest with simulated hardware: GPS position, network on/off, and SQLite through Node's built-in
  engine running the app's real SQL. They do **not** cover native rendering, native permission dialogs, the native
  SQLite module on a phone, or Wi-Fi/firewall reachability. **The app has not been run on a physical phone by the
  assistant.**
- The dashboard has no automated UI tests. Its API calls and build were verified, but the pages have not been
  visually inspected by the assistant.
- There is no continuous integration (CI); all checks are run manually.

**Operations**
- The app guesses the server address from Expo's host address. That guess is wrong in Expo's `--tunnel` mode, where
  it has to be entered in Settings.
- Dashboard map tiles come from OpenStreetMap and need internet.
- The dashboard bundle is about 826 kB (no code splitting).

## 7. Required improvements (prioritised)

**Before the demonstration (manual, about 30 min)**
1. Run the app on the actual demo phone with Expo Go and walk through [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md): online
   SOS, responder update, offline SOS, sync.
2. Open every dashboard page once in the browser and check the layout.
3. Allow Node.js through the Windows firewall on private networks, and test from the phone on the demo Wi-Fi.
4. Run `npm run seed` just before presenting.

**Next development steps**
1. Allow an SOS without coordinates (nullable location, flagged "location unknown") so no emergency is blocked by GPS.
2. Push notifications for responders (Expo Notifications), or WebSockets for the dashboard.
3. Token hardening: shorter access tokens with refresh tokens, a `tokenVersion` to revoke on password change, and
   httpOnly cookies for the dashboard.
4. Pagination for the emergency list and statistics computed in SQL.
5. Continuous integration (CI) that runs `npm run typecheck`, `npm test` and the backend build on every push.
6. Hardware phase: ESP32 firmware and `SerialLoRaTransport` as described in
   [docs/LORA_INTEGRATION.md](docs/LORA_INTEGRATION.md), then field tests of range and timing before removing any
   "Simulated" label.

## 8. Testing results (final run)

```
npm run typecheck          backend ✔  dashboard ✔  mobile app ✔  mobile UI tests ✔
npm test                   backend 30/30 ✔   mobile sync engine 8/8 ✔
npm run build              backend tsc ✔   dashboard vite ✔
npm run test:integration   6/6 checks ✔ (live API: offline → restart → sync → duplicate → responder)
npm run test:ui            6/6 ✔ (backend must be running)
npx expo-doctor            20/20 ✔
npx expo export -p android bundle built ✔
Security probes            all 6 earlier failures now behave correctly
```

Mobile UI tests (`mobile/ui-tests/`):
1. Victim logs in → SOS with GPS → stored on the server with the phone's coordinates → responder resolves → the phone
   shows "Resolved" and the responder's name.
2. Network off → SOS queued → app restarted (database file re-opened) → still queued → network on → synced
   automatically and labelled `OFFLINE_SYNC`.
3. Responder in the mobile app: incoming list → accept → in progress → resolved, confirmed on the server.
4. Location permission blocked → SOS disabled → "Open phone settings" shown.
5. Registration → Home, My Requests, My Location (GPS coordinates), Profile and Settings screens all render.
6. Smoke test: splash → login → server reachable.

## 9. Hardware statement

No part of RescueMesh transmits over LoRa radio. Everything shown as mesh networking (nodes, links, hops, packet
counters, store-and-forward) is produced by a software simulator and is labelled "Simulated" in the dashboard. The
code is structured so that a real ESP32 gateway can be connected through `SerialLoRaTransport`. This requires
hardware, firmware and field testing that have not been done.

---

## 10. Final pre-hardware verification (19 November 2026)

Baseline: commit `0667a53`. This pass made targeted changes only; no architecture or design changes.

### 10.1 Changes made

**Demonstration geography moved from Lahore, Pakistan to Beirut, Lebanon** (fictional flash-flood scenario along the
Beirut River):

| Item | Before | After |
|---|---|---|
| Default map centre / zoom | 31.5204, 74.3587 / 12 | **33.884, 35.528 / 13** (backend default settings, and the dashboard fallback before settings load) |
| Gateway | GW-01 Lahore | **GW-01 EOC Gateway — Downtown Beirut** (33.896, 35.502) |
| Relays | RL-01…RL-05 Lahore | **Ashrafieh, Beirut River Bridge, Sin el Fil, Bourj Hammoud, Furn el Chebbak** (RL-05 starts offline, as before) |
| Endpoints | EP-01…EP-03 Lahore | **Dekwaneh, Jdeideh, Hazmieh** |
| Seeded emergencies | random ±6 km around Lahore | spread over a fixed on-land area of eastern Beirut / Metn (33.862–33.898 N, 35.505–35.565 E) |

- The topology is unchanged in shape: same links, same 4-hop routes, same relay triangle for duplicate suppression,
  same offline relay for the store-and-forward demo. Radio ranges are unchanged (gateway 3.0 km, relays 2.8 km,
  field nodes 2.5 km).
- The scenario now lives in one module, `backend/prisma/demoScenario.ts`, and is verified by a new test file,
  `backend/tests/scenario.test.ts` (7 tests).
- Records created by the mobile integration and UI tests use Beirut coordinates too, so test runs never put markers
  outside Lebanon on the dashboard.
- Docs updated: `docs/LORA_INTEGRATION.md` (topology diagram drawn from the actual computed links) and the
  `docs/API.md` examples.
- New read-only pre-demo checks: `backend/scripts/verify-demo-data.ts` (consistency of paths, counters and
  coordinates) and an extended `backend/scripts/check-topology.ts` (also shows routes with offline relays powered on).

**Earlier in the same day (commit `0667a53`, recorded here for completeness):**
- Mobile: safe-area spacing on the citizen Home and responder Incoming screens; plain back arrow on stacked screens;
  the assigned responder always comes from the server, with "Not assigned" when none.
- Terminology: Citizen / Responder / Administrator everywhere.
- Demo data: fictional +961 contacts.
- Communication monitoring: classified by channel.
- Seeded mesh counters: produced by the simulator.

### 10.2 Verification of the communication-monitoring changes

Checked against the running API after `npm run seed`:

| Requirement | Result |
|---|---|
| HTTP requests identified as live API communication | ✔ `HTTP_API`, nature `LIVE`, 10 SOS |
| Offline-synchronised requests identified separately | ✔ `OFFLINE_SYNC`, nature `LIVE`, 4 SOS |
| Simulated LoRa explicitly labelled simulated | ✔ `LORA_SIMULATED`, nature `SIMULATED`, 2 SOS; dashboard shows the "Simulated" tag and "no radio hardware" |
| Physical LoRa shown as not connected | ✔ `LORA_PHYSICAL`, nature `NOT_CONNECTED`, `sosRequests: null` (not reported as 0); transport `hardwareConnected: false` |
| Packet counters calculated by the simulator | ✔ `verify-demo-data.ts`: all 9 nodes' sent/received/dropped equal the simulator's counters for the seeded deliveries |
| Seeded mesh paths consistent | ✔ both seeded mesh messages: stored path `EP-01 > RL-03 > RL-02 > RL-01 > GW-01`, 4 hops, equal to the simulator's route |
| Offline node vs counters | ✔ RL-05 (offline) has 0/0/0 |

No screen, API field or document reports a simulated transmission as a real radio transmission.

### 10.3 Verification of the recent mobile improvements

| Item | How verified | Result |
|---|---|---|
| Home safe-area spacing | Code: hero uses `paddingTop: insets.top + 16` from `useSafeAreaInsets()` | ✔ in code; **visual check on a phone still needed** |
| Responder (Incoming) safe-area spacing | Same pattern in `IncomingScreen.tsx` | ✔ in code; **visual check on a phone still needed** |
| Minimal back button | Code: stack `headerBackButtonDisplayMode: 'minimal'`; tab hosts titled "Home" / "Emergencies" | ✔ in code; **visual check on a phone still needed** (the native header is not drawn in Jest) |
| Correct responder on the citizen's request screen | UI test 1: shows the backend-assigned "Ayesha Malik" and her phone `+961 70 000 101` | ✔ automated |
| "Not assigned" when no responder | UI test 1: shown before acceptance; no responder phone row | ✔ automated |
| Citizen / Responder / Administrator terminology | Code search: identical `ROLE_LABEL` in mobile and dashboard; no user-visible "victim" text left (only internal folder names and the API key `VICTIM`) | ✔ |

### 10.4 Exact test results for this version

Executed in this order. The backend was running (`tsx watch`, reloaded with these changes) against the freshly
seeded database. The backend unit tests prepare their own separate database (`backend/prisma/test.db`).

| Command | Exit code | Result |
|---|---|---|
| `npm run typecheck` | 0 | 0 TypeScript errors (backend, dashboard, mobile app, mobile UI tests) |
| `npm test` | 0 | backend **37/37** (30 previous + 7 new scenario tests); mobile sync engine **8/8** |
| `npm run build` | 0 | backend `tsc` ✔; dashboard Vite build ✔ |
| `npm run test:integration` | 0 | **6/6** checks (offline queue → restart → sync → DUPLICATE → responder resolve) |
| `npm run test:ui` | 0 | **6/6** tests, 2 suites |
| `npx expo-doctor` | 0 | **20/20** checks passed |
| `npx expo export -p android` | 0 | Hermes bundle built (2.7 MB) |
| `npx tsx scripts/verify-demo-data.ts` | 0 | 13/13 consistency checks |

The demo database was re-seeded after the tests, so no test records remain.

### 10.5 Remaining limitations

- **Physical ESP32 + LoRa communication is not implemented.** No radio hardware has been connected, programmed or
  tested. Every mesh node, link, hop, packet counter and gateway delivery is produced by a software simulator and is
  labelled as simulated. `SerialLoRaTransport` (backend) and `LoRaBridgeTransport` (mobile) are integration points
  that refuse to send.
- **Radio ranges are assumptions.** The simulated ranges (2.5–3.0 km) are plausible for urban LoRa but have not been
  measured. Real range in Beirut's dense streets may be shorter and must be established by field tests before any
  hardware claim.
- **Coordinates are approximate.** They are neighbourhood centres chosen for a coherent, fictional scenario, not
  surveyed installation sites. People's names are unchanged, fictional demo characters.
- **Not seen on a device.** The safe-area spacing and back-arrow changes are verified in code and the screens are
  driven in Jest, but the app was not run on a physical phone by the assistant. The dashboard layout was not
  inspected in a browser by the assistant.
- **Backend test fixtures** (`backend/tests/*`) still use arbitrary coordinates near 31.5 N, 74.3 E. They only exist in
  the separate test database and never appear in the demonstration.
- The other limitations in §4 and §6 still apply (SOS needs a location fix, polling instead of push, JWT in
  localStorage, plain HTTP on the local network, no CI).

### 10.6 Hardware confirmation

**Physical ESP32/LoRa communication is not implemented in RescueMesh.** The system demonstrates the communication
protocol (packet format, compact ≤ 222-byte encoding, flood routing, hop limit, duplicate suppression,
store-and-forward) in software only. Moving to hardware requires ESP32 + LoRa modules, firmware, the serial gateway
transport and field testing, as described in `docs/LORA_INTEGRATION.md`.
