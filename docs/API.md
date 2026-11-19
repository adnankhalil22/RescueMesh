# RescueMesh API Reference

Base URL: `http://<host>:4000/api` · JSON in and out · Authentication: `Authorization: Bearer <JWT>`

**Response envelope**

```json
{ "data": { ... } }                                  // success
{ "error": { "message": "...", "details": { ... } } } // failure
```

| Status | Meaning |
|---|---|
| 400 | Validation failed (`details.fieldErrors` lists fields) |
| 401 | Missing / invalid / expired token |
| 403 | Role not allowed, or account deactivated |
| 404 | Not found |
| 409 | Conflict (duplicate email, invalid status transition) |
| 500 | Server error |

Roles: `VICTIM` (citizen), `RESPONDER`, `ADMIN`.

---

## Health

`GET /health` → `{ "data": { "status": "ok", "database": "connected", "time": "..." } }` (public; used by clients to decide "online").

## Authentication

### `POST /auth/register` (public)
```json
{ "name": "Ali Raza", "email": "ali@example.com", "password": "min8chars", "phone": "+92...", "bloodGroup": "B+", "emergencyContact": "..." }
```
→ `201 { data: { token, user } }`. Always creates a `VICTIM` account (a `role` field is ignored).

### `POST /auth/login` (public)
`{ "email", "password" }` → `{ data: { token, user } }` · 401 wrong credentials · 403 deactivated.

### `GET /auth/me` → current user. `POST /auth/change-password` `{ currentPassword, newPassword }`.

## Emergencies

### `GET /emergencies`
Query: `status`, `type`, `priority`, `search` (ID, description, reporter), `mine=true`, `assignedToMe=true`,
`includeArchived=true`, `sort` (`createdAt|priority|status|type|updatedAt`), `order` (`asc|desc`), `limit` (≤ 1000).
Victims always receive only their own requests.

Emergency object:
```json
{
  "id": "SOS-3f2a...", "code": "A1B2C3D4", "type": "TRAPPED", "priority": "CRITICAL", "status": "PENDING",
  "description": "Water rising", "latitude": 31.52, "longitude": 74.35, "accuracy": 12, "peopleCount": 4,
  "channel": "OFFLINE_SYNC", "archived": false,
  "createdAt": "...", "receivedAt": "...", "updatedAt": "...", "acceptedAt": null, "resolvedAt": null,
  "reporter": { "id": "...", "name": "Ali Raza", "phone": "...", "email": "..." }, "reporterName": "Ali Raza",
  "responder": null,
  "history": [ { "id": "...", "status": "PENDING", "note": "...", "createdAt": "...", "user": null } ]
}
```
(`history` only on the single-item endpoint.)

### `POST /emergencies`
Direct online submission (the mobile app uses `/sync/messages` instead; both go through the same ingest pipeline).
```json
{ "id": "optional-client-id", "type": "FIRE", "priority": "CRITICAL", "description": "...", "latitude": 31.5, "longitude": 74.3, "accuracy": 10, "peopleCount": 2 }
```
`priority` defaults from the type (FIRE/TRAPPED/BUILDING_COLLAPSE → CRITICAL, MEDICAL/MISSING_PERSON → HIGH, OTHER → MEDIUM).
→ `201` created, or `200` if that `id` already exists.

### `GET /emergencies/:id` — owner, responders, admins.

### `PATCH /emergencies/:id/status`
`{ "status": "IN_PROGRESS", "note": "Team on site" }`. Responders/admins follow the transition table in
[DATABASE.md](DATABASE.md); victims may only set `CANCELLED` on their own `PENDING`/`ACCEPTED` request. Moving to
`ACCEPTED`/`IN_PROGRESS` assigns the caller if nobody is assigned. Invalid transition → 409.

### `PATCH /emergencies/:id/assign` (responder, admin)
`{}` = assign yourself (accept; `PENDING` becomes `ACCEPTED`). Admins may pass `{ "responderId": "<user id>" }` or `null` to unassign.

### `DELETE /emergencies/:id` (admin)
Toggles `archived` (archived requests are hidden unless `includeArchived=true`). `?hard=true` deletes permanently.

## Offline synchronisation

### `POST /sync/messages` (any signed-in user)
Uploads up to 100 outbox messages. Each is processed independently and idempotently.
```json
{
  "messages": [
    {
      "messageId": "MSG-6d1c...", "sourceNodeId": "PHONE-3F9A1C22B0", "destinationNodeId": "SERVER",
      "type": "SOS", "latitude": 31.5204, "longitude": 74.3587, "timestamp": 1794939000000,
      "priority": "CRITICAL", "hopCount": 0, "maxHops": 6,
      "payload": { "requestId": "SOS-9a2e...", "category": "TRAPPED", "description": "...", "peopleCount": 3, "accuracy": 8, "queuedOffline": true }
    }
  ]
}
```
Response:
```json
{
  "data": {
    "results": [ { "messageId": "MSG-6d1c...", "result": "ACCEPTED", "deliveryStatus": "DELIVERED", "requestId": "SOS-9a2e...", "requestStatus": "PENDING" } ],
    "summary": { "accepted": 1, "duplicates": 0, "rejected": 0 },
    "serverTime": "..."
  }
}
```
- `ACCEPTED` → stored. `DUPLICATE` → already stored earlier (still `DELIVERED`; the client must stop retrying).
- `REJECTED` → invalid (`deliveryStatus: FAILED`, `error` explains); the client must not retry automatically.
- Message types handled: `SOS` (creates the request; `queuedOffline: true` marks channel `OFFLINE_SYNC`),
  `LOCATION` (`payload.requestId`; updates the victim's position — own requests only). `STATUS`, `ACK`, `CHAT` are stored.

### `GET /sync/messages?transport=HTTP|LORA_SIM&limit=100` (responder, admin) — received-message log.

## Users

- `GET /users?role=&search=` (responder: read-only, admin) — includes `reportedCount`, `assignedCount`.
- `GET /users/:id` — self, responders, admins.
- `PATCH /users/:id` — self: `name, phone, bloodGroup, emergencyContact, organization`; admin additionally `role`,
  `isActive`. Nobody can change their own role or deactivate themselves.

## Statistics

`GET /stats/overview` (responder, admin) — computed from the database on every call:
`totals {total, pending, active, resolved, cancelled, criticalOpen}`, `byType`, `byPriority`, `byStatus`,
`byChannel`, `daily` (14 days: reported/resolved), `avgResponseMinutes`, `users` by role, `nodes`, `recent` (8).

## Communication (simulated LoRa mesh) — responder, admin

| Endpoint | Description |
|---|---|
| `GET /comm/status` | API/DB status, transport info (`simulated: true`, `hardwareConnected: false`), node counts, message counters (received HTTP/LoRa, duplicates blocked, rejected), LoRa packet counters, pending packets |
| `GET /comm/nodes` | Nodes with counters and `heldPackets`, plus `links` (pairs in radio range) |
| `PATCH /comm/nodes/:id` | `{ online?, name?, latitude?, longitude?, rangeKm? }` → updated node + `retried` held packets |
| `POST /comm/simulate` | `{ sourceNodeId, destinationNodeId?="SERVER", type?="SOS", category?, priority?, description?, peopleCount?, messageId? }` → `{ simulated, packet, onAirBytes, maxFrameBytes, delivered, queued, ingest, trace: { events[], path, hopCount, transmissions, duplicatesDropped, holders } }`. Re-send an existing `messageId` to demonstrate duplicate suppression. |
| `GET /comm/transmissions` | Last 25 simulated transmissions with traces (in memory) |
| `GET /comm/pending` | Packets waiting for a route |

Trace event types: `ORIGIN`, `TX`, `RX`, `DUPLICATE_DROPPED`, `HOP_LIMIT`, `DELIVERED`, `NODE_OFFLINE`, `NO_ROUTE`.

## Settings

`GET /settings` (signed in) · `PUT /settings` (admin, partial):
`organizationName`, `maxHops` (1–15, used by the simulator), `mapCenterLat`, `mapCenterLng`, `mapZoom`,
`autoRefreshSeconds` (3–300, dashboard polling).
