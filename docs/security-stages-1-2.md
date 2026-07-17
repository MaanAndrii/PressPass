# Security stages 1–2 acceptance matrix

This audit is intentionally limited to crypto primitives and key/access lifecycle. Business-field
encryption, plaintext migration, and production hardening belong to stages 3–4.

| Requirement                                                           | Status   | Evidence                                                                               |
| --------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| Versioned AES-256-GCM envelopes with authenticated context            | Accepted | `DataEncryptionService` and tamper/context tests                                       |
| Argon2id password-derived wrapping keys with bounded parameters       | Accepted | KDF validation and round-trip tests                                                    |
| Raw data/wrapping keys are never persisted                            | Accepted | Prisma stores JSON envelopes only; services zero temporary buffers                     |
| One random data key per password account                              | Accepted | registration, admin and journalist creation provision key material                     |
| Password change rewraps the same data key                             | Accepted | `MeService.changePassword` and key-material tests                                      |
| Recovery grant preserves the data key during an admin reset           | Accepted | server-scoped recovery envelope and legacy fallback tests                              |
| Legacy accounts remain usable                                         | Accepted | plaintext-era accounts provision on reset; stage-1 accounts backfill recovery on login |
| Multi-editorial membership creates one grant per editorial            | Accepted | grant sync deduplicates membership ids and removes stale grants                        |
| Removing membership revokes its editorial grant                       | Accepted | detach path deletes the matching grant                                                 |
| Logout and password changes revoke existing JWTs                      | Accepted | version is signed into JWT and checked against the database on every request           |
| Google and email-verification token issuance carry revocation version | Accepted | all access-token issuance paths include `tokenVersion`                                 |
| Existing migrations are not duplicated                                | Accepted | stage 2 uses one additive migration after the existing envelope migration              |
| Auth tests use one shared JWT mock                                    | Accepted | `auth/testing/jwt-service.mock.ts`                                                     |

## Explicitly deferred

### Stage 3

- Encrypt journalist, editorial, card, settings, and other business fields.
- Backfill existing plaintext without losing availability or multi-editorial access.
- Remove or transform plaintext columns only after verified migration and rollback rehearsal.

### Stage 4

- Move the root key to a managed KMS/HSM and remove the temporary `JWT_SECRET` compatibility fallback.
- Add key rotation, audit events, operational alerts, backup/restore and disaster-recovery drills.
- Run load, penetration, dependency, container and deployment hardening checks before final release.
