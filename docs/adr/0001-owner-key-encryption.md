# ADR 0001: owner-key encryption and API unlock sessions

- Status: Accepted
- Date: 2026-07-17

## Context

PressPass must keep personal, editorial, credential and file contents confidential when the
database and uploads are copied. The existing AES-256-GCM primitives and per-user data-key envelope
are retained, but server-derived editorial/recovery wrapping keys are transitional and do not meet
the owner-key requirement.

## Decision

### Decryption boundary

Decryption happens inside a short-lived API unlock session. Raw keys exist only in API process
memory, are never serialized, and are removed on expiry, logout, password/key changes and process
restart. Authentication and unlock are separate: a valid access token does not imply an unlocked
key. The initial unlock TTL is 15 minutes and is capped rather than silently persisted.

### Key hierarchy

- Every protected owner has a random 256-bit Data Encryption Key (DEK).
- A password journalist wraps their profile DEK with an Argon2id-derived User KEK.
- Every administrator has a random 256-bit Admin KEK. It is wrapped by a distinct Argon2id-derived
  encryption-passphrase KEK; the login password is not reused.
- Every editorial has a random 256-bit Editorial KEK. It is wrapped independently for every active
  administrator with that administrator's Admin KEK.
- A journalist profile DEK is wrapped independently for every accepted editorial membership with
  the Editorial KEK.
- Two independent RSA-OAEP-SHA256 recovery authorities seal every owner DEK. The server retains only
  public keys, sealed owner slots and fingerprints. Each encrypted private-key kit is emitted once
  during authority enrollment and must then be kept offline.
- `DATA_KEY_SECRET` is retained only for migration compatibility and must not be able to decrypt new
  owner-key envelopes.

All envelopes use AES-256-GCM, a fresh 96-bit nonce, a 128-bit authentication tag, explicit format
and algorithm versions, and canonical AAD containing entity, entity ID, field, owner and key version.

### Google accounts

Google OAuth authenticates the user but never acts as encryption key material. A Google-only user
must enroll and subsequently enter a separate encryption passphrase before protected data can be
created or decrypted. Recovery can replace the passphrase by rewrapping the same profile DEK.

### Encrypted records and lookup

Meaningful fields are stored in versioned encrypted payloads. Only relational IDs, foreign keys,
key/version references, lifecycle timestamps and explicitly accepted operational status metadata
remain plaintext. Email lookup uses a canonical normalized email and a versioned HMAC-SHA-256 blind
index derived from an independent `LOOKUP_KEY`; plaintext email is removed after backfill acceptance.

### Files

Private files are encrypted before reaching durable storage. Their random file DEK is wrapped by the
owning profile/editorial DEK. Files are returned only through authorization-aware endpoints with
private/no-store cache headers. Direct static access to uploads is removed. Replacement is atomic and
old/orphan encrypted blobs are cleaned after successful commit.

### Migration

Migration is expand/backfill/verify/contract:

1. add encrypted columns, blind indexes and key slots without removing legacy data;
2. dual-write encrypted data and allow legacy reads only during migration;
3. run an idempotent, resumable backfill for database rows and files;
4. verify decryptability and scan database/uploads for plaintext;
5. disable legacy reads and remove plaintext columns/files in a later contract migration.

The contract step is forbidden until a tested database/uploads backup and restore rehearsal passes.

## Consequences

- API restarts intentionally lock protected data until owners unlock again.
- Multi-instance deployments need an explicitly designed in-memory key broker or sticky unlock
  routing; keys must not be placed in ordinary Redis/session storage.
- Losing every Superadmin slot, every relevant editorial/admin slot and the user's passphrase makes
  the affected DEK unrecoverable by design.
- Public QR verification requires a deliberately minimized public projection; private profile
  payloads and files are never made public by knowing an object ID.
