# Database backups

The `Backup Database` GitHub Actions workflow is scheduled daily at 02:23
Asia/Dhaka (20:23 UTC on the preceding day). The target is a recovery point no
more than 24 hours old. In **Actions → Backup Database**, check the age of the
latest backup and confirm its artifact is available. If the backup is stale or
a run failed, use **Run workflow** on the default branch once any run in
progress finishes. GitHub can delay or drop scheduled runs and can disable them
after 60 days of inactivity in a public repository. If GitHub disables the
workflow, use **Enable workflow** before running it manually.
[GitHub scheduling behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

The workflow uses the `SUPABASE_DB_URL` repository secret and the public age
recipients in `config/backup-recipients.txt`.

## Connection setup

In Supabase, select this project, then **Connect → Direct → Session pooler →
URI**. Use the session pooler endpoint on port 5432 for GitHub-hosted IPv4
runners. Replace the password placeholder with the actual database password
and percent-encode reserved characters in the password. Store the complete URI
in the GitHub Actions secret `SUPABASE_DB_URL`, without quotes, spaces or newlines.
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
counts, SHA-256 hashes and aggregate table and row counts. The workflow cleans
up the temporary plaintext before uploading the pair. Each successful run
keeps the pair in an Actions artifact for 30 days. The workflow only reads the
repository, so backup runs produce no commits or Vercel deployments.

## Backup retention

From the successful run's **Artifacts** section, download and extract the
artifact to get the encrypted archive and its manifest. Signed-in GitHub users
with read access to this public repository can download both files. The
manifest is readable and decryption requires the private recovery key.
[GitHub artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

Keep regular copies of both files in secure offline storage, at least weekly
and before an artifact you need expires. Keep a secure offline copy of the
private recovery key separately from the backups. Never commit the key or
upload it to Actions. Earlier files in `db-backups/` remain in Git history.
The existing encrypted pair can serve as an older recovery point. Always
verify the pair before restoring it.

For private artifact access, move this workflow, the backup scripts and tests,
and the public recipient configuration to a dedicated private GitHub
repository. The repository owner needs to enter the connection URI as the value
of the `SUPABASE_DB_URL` Actions secret in the private repository. Verify that
the private workflow publishes a recoverable backup before disabling the public
workflow and removing its database secret. Vercel can continue deploying app
changes from the existing repository.

The dump covers the PostgreSQL database. Back up Storage objects, project
settings, secrets, and database cluster roles separately when required.

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
