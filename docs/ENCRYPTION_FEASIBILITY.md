---
summary: "Feasibility findings for encrypting Ordning's on-disk data and exports."
read_when:
  - Planning encrypted persistence for ordning-data.json.
  - Implementing password-protected startup unlock or encrypted export.
---

# Encryption Feasibility

Date: 2026-03-03
Scope: TODO #160 (findings only, no implementation)

## Verdict

Encryption is feasible in the current Tauri architecture without replacing the JSON store model.

Recommended crates:

- `argon2` (`0.5.3` on docs.rs) for password-to-key derivation
- `aes-gcm` (`0.10.3` on docs.rs) for authenticated encryption of the serialized `AppData`

Recommended algorithm shape:

- KDF: Argon2id
- Cipher: AES-256-GCM
- Per-file random salt
- Per-write random nonce
- Password kept in memory only for the active unlock session

## Why These Crates Fit

### `argon2`

- Current `argon2` docs expose `Argon2::default()` as Argon2id v19 and provide `ParamsBuilder` for explicit `m_cost`, `t_cost`, and `p_cost`.
- The crate publishes `RECOMMENDED_SALT_LEN = 16`, which fits a simple file-envelope design.
- It uses the `password-hash` ecosystem types, but file encryption does not need a PHC string. We can derive raw key bytes directly and store the salt plus explicit parameters in the file header.

Conclusion: good fit for a password-derived file key; no extra native dependency.

### `aes-gcm`

- Current docs expose `Aes256Gcm` plus `Aead` encrypt/decrypt helpers.
- The crate uses a 96-bit nonce (`Nonce<U12>`), which is standard for GCM and easy to generate randomly per save.
- `AeadCore::generate_nonce(&mut OsRng)` is available, so nonce generation is straightforward.
- The docs explicitly warn that nonce reuse breaks security. Ordning writes full snapshots, so generating a new random nonce on every save is simple and safe.

Conclusion: good fit for whole-file authenticated encryption as long as each save uses a fresh nonce.

## Recommended Key Derivation

Do not rely on implicit crate defaults as a persistence contract. Store the exact parameters used for each encrypted file so future versions can still derive the same key.

Recommended initial parameters:

- variant: Argon2id
- version: 19
- memory cost: 65536 KiB (64 MiB)
- time cost: 3
- parallelism: 1
- salt length: 16 bytes
- derived key length: 32 bytes

Rationale:

- 32 bytes matches `Aes256Gcm`.
- 64 MiB / 3 passes is a practical desktop default for an offline app, materially stronger than a fast hash while still tolerable at startup and export time.
- `p_cost = 1` avoids surprising CPU spikes on lower-end systems and keeps behavior predictable across machines.

Implementation note for #162:

- Build `argon2::Params` explicitly.
- Derive a 32-byte key into a stack buffer.
- Zeroize password and derived key buffers after use.
- Never store the password in `settings` or on disk.

## Recommended File Format

Keep the existing filename `ordning-data.json`, but change the payload from plain `AppData` JSON to a JSON envelope when encryption is enabled. This avoids new path logic and keeps import/export file filters unchanged.

Suggested encrypted envelope:

```json
{
  "format": "ordning-encrypted-1",
  "kdf": {
    "algorithm": "argon2id",
    "version": 19,
    "m_cost": 65536,
    "t_cost": 3,
    "p_cost": 1,
    "salt_b64": "..."
  },
  "cipher": {
    "algorithm": "aes-256-gcm",
    "nonce_b64": "..."
  },
  "ciphertext_b64": "..."
}
```

Plaintext before encryption:

- Serialize the existing `AppData` with the same `serde_json::to_vec_pretty` call already used by `JsonStore::save()`.

Why JSON envelope instead of raw binary:

- Minimal disruption to `JsonStore`
- Same `.json` file extension for dialogs and backups
- Easy versioning and migration
- KDF parameters can evolve per file without breaking old data

Backward-compatibility strategy:

- On load, inspect the top-level JSON.
- If it matches `AppData`, treat it as legacy plaintext.
- If it matches `format = "ordning-encrypted-1"`, require password and decrypt.
- Any future format bump can use `ordning-encrypted-2`.

## UX Implications

### Startup Unlock

Current startup calls `JsonStore::load_or_create()` before the window is ready. Encrypted persistence will require a short bootstrap change:

- Detect encrypted envelope before constructing `AppState`.
- If encrypted, render a password prompt before loading calendar data into the main UI.
- On wrong password, allow retry and quit. Do not silently overwrite or create a new file.
- On success, keep decrypted `AppData` in memory only; password itself should not remain in state after the save key is derived.

### Enabling Encryption

Recommended first implementation:

- Add a settings action such as "Encrypt local data file".
- Ask for password + confirm password.
- Re-write the current in-memory `AppData` using the encrypted envelope.
- After encryption is enabled, all future saves stay encrypted.

Avoid auto-migrating plaintext to encrypted solely because a password was entered for export. Data-file encryption and export encryption are separate user actions.

### Export Dialog

Current export already has a content mode (`full` vs `public`). Keep that dimension separate from encryption.

Recommended export UX:

- Existing choice stays: `Full` or `Public`
- Add independent toggle: `Encrypt export`
- If enabled, ask for export password + confirm
- Write the same encrypted envelope format as the local data file

This keeps the export format predictable:

- `Full + Plaintext`: current behavior
- `Public + Plaintext`: current behavior
- `Full + Encrypted`: password-protected backup
- `Public + Encrypted`: password-protected shareable export

## Risks / Tradeoffs

- Lost password means lost encrypted data. There is no safe recovery path without storing a second secret somewhere else.
- Startup gets one more blocking step for users with encrypted local data.
- Existing tests assume plain JSON reads/writes; #162 will need direct storage tests plus e2e coverage for unlock flow and encrypted export.
- Base64 + JSON envelope adds size overhead versus plaintext JSON, but the data set is small and the tradeoff is acceptable.

## Recommendation For TODO #162

Proceed with encrypted persistence using:

- `argon2` for explicit Argon2id key derivation
- `aes-gcm` for whole-file AEAD
- A versioned JSON envelope stored at the existing `ordning-data.json` path

Implementation should not start until the reviewer approves:

- the envelope shape
- the explicit Argon2 parameter set
- the startup password prompt behavior
- whether export encryption can reuse the same envelope format

## Sources

- https://docs.rs/argon2/latest/argon2/
- https://docs.rs/argon2/latest/argon2/constant.RECOMMENDED_SALT_LEN.html
- https://docs.rs/aes-gcm/latest/aes_gcm/
- https://docs.rs/aes-gcm/latest/aes_gcm/struct.AesGcm.html
