# RescueMesh — System Architecture

## 1. Components

```mermaid
flowchart TB
  subgraph Mobile["Mobile app — React Native / Expo"]
    direction TB
    Screens["Screens<br/>Victim: Home · SOS · Location · My Requests · Details · Profile · Settings<br/>Responder: Incoming · Details · Profile · Settings"]
    Ctx["AuthContext · SyncContext<br/>(session, connectivity, auto-sync)"]
    Services["Services<br/>sos.ts · location.ts · api.ts"]
    Store[("SQLite rescuemesh.db<br/>outbox · requests<br/>kv-store: session, settings")]
    Engine["syncEngine.ts<br/>(pure TS, unit-tested)"]
    T1["HttpTransport"]
    T2["LoRaBridgeTransport<br/>(no hardware → unavailable)"]
    Screens --> Ctx --> Services --> Store
    Ctx --> Engine --> Store
    Engine --> T1
    Engine -.-> T2
  end

  subgraph Backend["Backend — Node.js / Express / TypeScript"]
    direction TB
    MW["JWT auth · role guard · zod validation · error handler"]
    Routes["Routes: auth · users · emergencies · sync · comm · stats · settings"]
    Ingest["Ingest pipeline<br/>idempotent, dedup by message ID"]
    Mesh["Mesh layer<br/>packet.ts · simulator.ts<br/>SimulatedLoRaTransport · SerialLoRaTransport (stub)"]
    Prisma[("Prisma ORM → SQLite<br/>(PostgreSQL-ready)")]
    MW --> Routes --> Ingest --> Prisma
    Routes --> Mesh --> Ingest
    Routes --> Prisma
  end

  subgraph Dashboard["Dashboard — React / Tailwind / Recharts / Leaflet"]
    Pages["Overview · Live Map · Emergencies · Users · Communication · Settings"]
  end

  T1 -- "HTTPS/HTTP JSON<br/>POST /api/sync/messages" --> MW
  Screens -- "REST (responder actions, status refresh)" --> MW
  Pages -- "REST, polled every N s" --> MW
```

### Design decisions

| Decision | Reason |
|---|---|
| Store-then-send on the phone | An SOS must never depend on the network being up at the moment the button is pressed. |
| Client-generated IDs (UUID v4) | Lets the server de-duplicate retries; the phone can reference the request before the server has seen it. |
| One ingest pipeline for HTTP and LoRa | Offline sync and mesh delivery share validation and de-duplication; a future hardware gateway plugs into the same path. |
| Pure sync engine and pure mesh simulator | Testable in Node without a phone or radios; UI is independent of communication logic. |
| Polling instead of WebSockets in the dashboard | Simpler and robust on weak networks; interval is configurable (Settings → Dashboard refresh). |
| Enumerations as validated strings | SQLite in development, PostgreSQL later, with no schema rewrite. |
| Simulated data always labelled | The dashboard shows a "Simulated" tag wherever node data comes from the simulator. |

## 2. Communication flows

### 2.1 Online SOS

```mermaid
sequenceDiagram
  actor V as Victim
  participant App as Mobile app
  participant DB as Phone SQLite
  participant API as Backend API
  participant PDB as Server DB
  actor R as Responder (dashboard / app)

  V->>App: Press SOS, choose category
  App->>App: GPS fix (expo-location)
  App->>DB: INSERT request + outbox message (PENDING) — one transaction
  App->>API: POST /api/sync/messages [packet]
  API->>PDB: Message (unique id) + EmergencyRequest (channel ONLINE)
  API-->>App: result ACCEPTED, deliveryStatus DELIVERED
  App->>DB: outbox → DELIVERED
  R->>API: GET /api/emergencies (poll)
  API-->>R: new SOS on map / table
  R->>API: PATCH /assign, PATCH /status IN_PROGRESS, RESOLVED
  App->>API: GET /api/emergencies/:id (refresh)
  API-->>App: status RESOLVED + timeline
```

### 2.2 Offline SOS with automatic synchronisation

```mermaid
sequenceDiagram
  participant App as Mobile app
  participant DB as Phone SQLite
  participant Sync as Sync engine
  participant API as Backend API

  Note over App: No network / server unreachable / offline mode
  App->>DB: INSERT request + outbox (QUEUED)
  Sync->>API: attempt upload
  API--xSync: network error
  Sync->>DB: QUEUED, attempts+1, nextAttemptAt = now + backoff
  Note over App,DB: App may be closed — data is on disk
  Note over App: Connectivity returns (health check succeeds)
  Sync->>DB: mark SENT (before the request)
  Sync->>API: POST /api/sync/messages [all due packets, SOS first]
  API-->>Sync: ACCEPTED / DUPLICATE → DELIVERED, REJECTED → FAILED
  Sync->>DB: update statuses, store server request status
```

If the app dies after the server stored a message but before the phone recorded the reply, the message stays `SENT`
and is uploaded again; the server answers `DUPLICATE` (treated as delivered) and stores nothing new.

### 2.3 Simulated LoRa multi-hop delivery

```mermaid
sequenceDiagram
  participant EP as EP-01 field node
  participant R3 as RL-03 relay
  participant R4 as RL-04 relay
  participant R2 as RL-02 relay
  participant R1 as RL-01 relay
  participant GW as GW-01 gateway
  participant ING as Ingest pipeline

  EP->>R3: broadcast (hop 0→1)
  R3->>R2: broadcast (hop 1→2)
  R3->>R4: broadcast (hop 1→2)
  R2->>R4: duplicate → dropped (seen cache)
  R4->>R2: duplicate → dropped
  R2->>R1: broadcast (hop 2→3)
  R1->>GW: broadcast (hop 3→4)
  GW->>ING: deliver packet (path, hopCount = 4)
  ING-->>GW: ACCEPTED (EmergencyRequest channel LORA_SIM)
```

If no route exists (e.g. relay RL-05 powered off), the packet is stored in `PendingPacket` at the last node that holds
it and re-flooded automatically when any node's state changes (store-and-forward).

## 3. Security

- Passwords hashed with bcrypt (cost 10); never returned by the API.
- JWT (HS256) with a random 96-hex-character secret generated into `backend/.env` (git-ignored).
- Every request re-loads the user: deactivated accounts lose access immediately, even with a valid token.
- Role-based guards: public registration always creates `VICTIM`; only admins change roles; victims only see and
  cancel their own requests; users cannot change their own role or deactivate themselves.
- All input validated with zod; consistent error format `{ error: { message, details } }`.
- `.env`, databases and build output are git-ignored.
