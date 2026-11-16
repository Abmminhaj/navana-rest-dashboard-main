# Database backups

The `Backup Database` GitHub Actions workflow runs every Sunday at 02:00
Asia/Dhaka (Saturday 20:00 UTC), and can also be run manually. It uses the
`SUPABASE_DB_URL` repository secret and the public age recipients in
`config/backup-recipients.txt`.

## Connection setup

In Supabase, select this project, then **Connect → Direct → Session pooler →
URI**. Use the session pooler endpoint on port 5432 for GitHub-hosted IPv4
runners. Replace the password placeholder with the actual database password;
percent-encode reserved characters in the password. Store the complete URI in
the GitHub Actions secret `SUPABASE_DB_URL`, without quotes, spaces or newlines.
Never paste it into source files, logs, issues or chat. TLS is required.

The old workflow's malformed URI caused `pg_dump` to fail, but the following
`gzip` process succeeded. This produced 20-byte gzip files containing no SQL.
Those legacy files are not usable backups.

## What a successful run means

The workflow requires all of the following before publishing anything:

- Configuration passes validation without printing credentials.
- PostgreSQL 18 `pg_dump` exits successfully.
- The SQL contains the dump header and completion marker, the application's
  `public.rooms` and `public.bookings` tables, complete COPY sections, and at
  least one application data row.
- Gzip decompression reproduces the original SQL's byte count and SHA-256.
- Age encryption succeeds and produces a ciphertext file.

Only `backup-<UTC timestamp>-<unique ID>.sql.gz.age` and its
`.sql.gz.age.metadata.json` companion are published. The manifest records byte
counts, SHA-256 hashes and aggregate table/row counts; it contains no SQL rows.
An encrypted Actions artifact is retained for seven days. On `main`, the same
pair is committed to `db-backups/`. A run on `fix/database-backups` publishes
only an artifact, so a real backup can be checked before this repair reaches
`main`. A failed run publishes no empty or partial backup.

The public repository contains encrypted backups only. Plaintext exists in
private temporary storage during the job and is cleaned up afterwards. The
workflow does not need the private recovery key. Keep a separate secure copy
of that key: without it, the backups cannot be recovered. Never commit it or
upload it as an Actions artifact.

Backups are currently retained in Git; there is no automatic deletion. Git
history would retain old data even if a retention job removed working-tree
files. These are logical database dumps, not a backup of Storage object bytes,
project settings, secrets, or database cluster roles.

## Verify a downloaded backup

Install Python 3.10+ and [age](https://github.com/FiloSottile/age). Download the
encrypted backup and matching manifest into a directory outside this Git
checkout. Keep the private recovery key outside the checkout too. From the
repository root, run:

```sh
python scripts/backup_cli.py verify \
  --backup /private/backups/backup-TIMESTAMP-ID.sql.gz.age \
  --identity-file /private/keys/navana-backup-recovery-key.txt
```

Use `--age /path/to/age` if age is not on PATH. A successful command exits zero
and prints only the manifest. It decrypts into temporary storage, checks the
encrypted, gzip and SQL hashes and byte counts, revalidates the SQL structure
and aggregate counts, then removes the temporary plaintext. A wrong key,
truncated file, altered manifest or corrupted archive fails verification.

This check verifies the encrypted backup's contents and integrity. It does
not execute SQL or prove that a complete restore succeeds.

## Recovery

First run the verification command above. For an explicitly planned recovery,
use age to decrypt into a private directory, decompress the resulting gzip,
and rehearse recovery in an isolated compatible PostgreSQL/Supabase database.
This dump includes `--clean --if-exists`, so restoring it can replace existing
database objects and data. Production recovery requires a separate approved
procedure and a fresh backup of the target.

Use `psql -X --set ON_ERROR_STOP=on` when testing a restore so SQL failures stop
the operation. Supabase-managed schemas, extensions and roles need a compatible
target; a general PostgreSQL server is not automatically equivalent. Do not
run the old `gunzip | psql` workflow against an encrypted backup or an empty
legacy file. The old manual Restore Database workflow now stops with these
instructions and does not connect to the database. Recovery is performed
locally with the private key; it is not automated by this change.

See the official [Supabase backup guidance](https://supabase.com/docs/guides/deployment/ci/backups)
for connection and restore-environment requirements.

## Local checks

```sh
python -m unittest discover -s tests -v
```

Install age and age-keygen to run all encryption integration tests. On Windows,
the `AGE_EXE` and `AGE_KEYGEN_EXE` environment variables may point to the two
executables. These tests use synthetic data and never connect to production.
