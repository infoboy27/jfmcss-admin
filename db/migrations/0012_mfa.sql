-- Optional per-user TOTP two-factor auth. `mfa_secret` holds the base32 secret
-- once enrolment starts; `mfa_enabled` flips true only after a code is verified.
-- Backup codes are stored as sha256 hashes.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_secret        text,
  ADD COLUMN IF NOT EXISTS mfa_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_backup_codes  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at   timestamptz;
