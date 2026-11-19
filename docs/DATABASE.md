# RescueMesh — Database Design

Server database: Prisma ORM, SQLite in development (`backend/prisma/schema.prisma`). Enumerated values are stored as
strings and validated in `backend/src/domain/constants.ts`, so changing the provider to PostgreSQL requires no model
changes.

## Entity-relationship diagram (server)

```mermaid
erDiagram
  User ||--o{ EmergencyRequest : "reports (reporterId)"
  User ||--o{ EmergencyRequest : "is assigned (responderId)"
  User ||--o{ StatusUpdate : "performs"
  User ||--o{ Message : "sends"
  EmergencyRequest ||--o{ StatusUpdate : "has history"

  User {
    string id PK "uuid"
    string name
    string email UK
    string phone
    string passwordHash "bcrypt"
    string role "VICTIM | RESPONDER | ADMIN"
    boolean isActive
    string bloodGroup
    string emergencyContact
    string organization
    datetime createdAt
    datetime lastLoginAt
  }

  EmergencyRequest {
    string id PK "client-generated request ID"
    string type "MEDICAL | TRAPPED | FIRE | BUILDING_COLLAPSE | MISSING_PERSON | OTHER"
    string priority "LOW | MEDIUM | HIGH | CRITICAL"
    string status "PENDING | ACCEPTED | IN_PROGRESS | RESOLVED | CANCELLED"
    string description
    float latitude
    float longitude
    float accuracy
    int peopleCount
    string channel "ONLINE | OFFLINE_SYNC | LORA_SIM"
    boolean archived
    datetime createdAt "device time"
    datetime receivedAt "server time"
    datetime acceptedAt
    datetime resolvedAt
    string reporterId FK
    string reporterName "for mesh-originated requests"
    string responderId FK
  }

  StatusUpdate {
    string id PK
    string requestId FK
    string status
    string note
    string userId FK
    datetime createdAt
  }

  Message {
    string id PK "client message ID — dedup key"
    string type "SOS | LOCATION | STATUS | ACK | CHAT"
    string sourceNodeId
    string destinationNodeId
    float latitude
    float longitude
    string priority
    int hopCount
    string path "JSON array of node IDs"
    string payload "JSON"
    string transport "HTTP | LORA_SIM"
    string deliveryStatus
    datetime createdAt "device time"
    datetime receivedAt
    string senderId FK
  }

  SyncEvent {
    string id PK
    string messageId
    string result "ACCEPTED | DUPLICATE | REJECTED"
    string transport
    string detail
    datetime createdAt
  }

  CommNode {
    string id PK "e.g. GW-01, RL-02, EP-01"
    string name
    string kind "GATEWAY | RELAY | ENDPOINT"
    float latitude
    float longitude
    float rangeKm
    boolean online
    boolean simulated "true until real hardware"
    int batteryLevel
    int packetsSent
    int packetsReceived
    int packetsDropped
    datetime lastSeen
  }

  PendingPacket {
    string id PK "message ID"
    string packet "JSON MeshPacket"
    string heldByNode
    int attempts
    string status
  }

  Setting {
    string key PK
    string value "JSON"
  }
```

`SyncEvent`, `CommNode`, `PendingPacket` and `Setting` are standalone tables (no foreign keys): `SyncEvent` is an audit
log of every ingest attempt (used for "duplicates blocked"), `CommNode`/`PendingPacket` hold the simulated mesh, and
`Setting` stores system configuration.

## Status transitions (EmergencyRequest)

```mermaid
stateDiagram-v2
  [*] --> PENDING: SOS received
  PENDING --> ACCEPTED: responder accepts / admin assigns
  PENDING --> IN_PROGRESS
  ACCEPTED --> IN_PROGRESS
  IN_PROGRESS --> ACCEPTED
  ACCEPTED --> PENDING: unassign
  PENDING --> RESOLVED
  ACCEPTED --> RESOLVED
  IN_PROGRESS --> RESOLVED
  PENDING --> CANCELLED: victim or responder
  ACCEPTED --> CANCELLED
  IN_PROGRESS --> CANCELLED
  RESOLVED --> PENDING: reopen
  CANCELLED --> PENDING: reopen
```

Every change writes a `StatusUpdate` row (who, when, optional note) shown as the request timeline.

## Mobile local database (`rescuemesh.db` on the phone)

```mermaid
erDiagram
  requests ||--o| outbox : "message_id = outbox.id"
  requests {
    text id PK "SOS-uuid"
    text user_id
    text message_id
    text type
    text priority
    text description
    real latitude
    real longitude
    real accuracy
    int people_count
    text status "last known server status"
    text responder_name
    int created_at
    int updated_at
  }
  outbox {
    text id PK "MSG-uuid (= packet.messageId)"
    text type "SOS | LOCATION"
    text packet "JSON MeshPacket"
    text status "PENDING | QUEUED | SENT | DELIVERED | FAILED"
    int attempts
    int next_attempt_at "retry back-off"
    text last_error
    text request_id
    text user_id
    int created_at
    int updated_at
  }
```

Session token, user profile, server address, offline-mode flag and the device node ID are stored in
`expo-sqlite/kv-store` (also SQLite-backed, persistent).
