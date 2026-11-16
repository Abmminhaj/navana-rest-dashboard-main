"""Encrypt verified database dumps, or verify them locally without restoring.

The private age identity is used only by ``verify``. Backup jobs need only a
public recipient file. Metadata is integrity evidence, not a digital signature.
"""

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid
import zlib

if __package__:
    from .database_backup import BackupError, create_dump, validate_database_url, validate_sql_dump
else:
    from database_backup import BackupError, create_dump, validate_database_url, validate_sql_dump


REPO = Path(__file__).resolve().parents[1]
DEFAULT_RECIPIENTS = REPO / "config" / "backup-recipients.txt"
_BACKUP_NAME = re.compile(r"backup-\d{4}-\d{2}-\d{2}T\d{6}Z-[0-9a-f]{32}\.sql\.gz\.age")
_DIGEST = re.compile(r"[0-9a-f]{64}")
_BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _valid_recipient(value):
    # Native age recipients are 32-byte X25519 keys with a Bech32 checksum.
    if len(value) != 62 or not value.startswith("age1"):
        return False
    try:
        values = [ord(c) >> 5 for c in "age"] + [0] + [ord(c) & 31 for c in "age"]
        values += [_BECH32.index(c) for c in value[4:]]
    except ValueError:
        return False
    checksum = 1
    for value in values:
        top = checksum >> 25
        checksum = ((checksum & 0x1FFFFFF) << 5) ^ value
        for bit, generator in enumerate((0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)):
            if (top >> bit) & 1:
                checksum ^= generator
    return checksum == 1


def _read_recipients(path):
    try:
        path = Path(path)
        if path.stat().st_size > 65536:
            raise ValueError
        lines = path.read_text(encoding="utf-8").splitlines()
        recipients = [line.strip() for line in lines if line.strip() and not line.lstrip().startswith("#")]
        if not recipients or any(not _valid_recipient(value) for value in recipients):
            raise ValueError
        return list(dict.fromkeys(recipients))
    except (OSError, UnicodeError, ValueError):
        raise BackupError("Recipient file must contain valid public age recipients only.") from None


def validate_config(recipient_file=DEFAULT_RECIPIENTS):
    """Check local configuration without connecting or invoking external tools."""
    validate_database_url(os.environ.get("DATABASE_URL", ""))
    recipients = _read_recipients(recipient_file)
    return {"database_url_valid": True, "recipients": len(recipients)}


def _file_metadata(path):
    digest = hashlib.sha256()
    size = 0
    with Path(path).open("rb") as source:
        while chunk := source.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return {"bytes": size, "sha256": digest.hexdigest()}


def _age_run(age, arguments):
    command = [os.fspath(age)] if isinstance(age, (str, os.PathLike)) else list(age)
    # Encryption tools have no reason to inherit database credentials.
    environment = {key: value for key, value in os.environ.items()
                   if key != "DATABASE_URL" and not key.startswith("PG")}
    try:
        result = subprocess.run(command + arguments, env=environment, stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                shell=False, check=False, timeout=600)
    except (OSError, subprocess.TimeoutExpired):
        raise BackupError("Age could not run or timed out; no verified backup was produced.") from None
    if result.returncode:
        raise BackupError("Age encryption or decryption failed; check the configured key files.")


def _external_output(path):
    output = Path(path).resolve()
    if output == REPO or REPO in output.parents or any((ancestor / ".git").exists()
                                                      for ancestor in (output, *output.parents)):
        raise BackupError("Backup output must be outside Git working trees.")
    return output


def backup_to_directory(output_dir, recipient_file=DEFAULT_RECIPIENTS, *, age="age", pg_dump="pg_dump"):
    """Publish an encrypted backup plus manifest only after all checks succeed."""
    database_url = validate_database_url(os.environ.get("DATABASE_URL", ""))
    recipients = _read_recipients(recipient_file)
    output = _external_output(output_dir)
    published = []
    try:
        output.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.TemporaryDirectory(prefix="backup-private-") as private, \
                tempfile.TemporaryDirectory(prefix=".backup-publish-", dir=output) as staging:
            dump = create_dump(database_url, private, pg_dump=pg_dump)
            recipients_path = Path(private) / "recipients.txt"
            recipients_path.write_text("\n".join(recipients) + "\n", encoding="utf-8")
            now = datetime.now(timezone.utc)
            name = f"backup-{now:%Y-%m-%dT%H%M%SZ}-{uuid.uuid4().hex}.sql.gz.age"
            ciphertext = Path(staging) / name
            _age_run(age, ["-R", str(recipients_path), "-o", str(ciphertext), str(dump.gzip_path)])
            encrypted = _file_metadata(ciphertext)
            with ciphertext.open("rb") as source:
                if source.read(22) != b"age-encryption.org/v1\n" or encrypted["bytes"] <= 22:
                    raise BackupError("Age output is missing or invalid; no backup was published.")
            manifest = {
                "schema_version": 1,
                "created_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "backup_file": name,
                "sql": {"bytes": dump.metadata.bytes, "sha256": dump.metadata.sha256},
                "gzip": _file_metadata(dump.gzip_path),
                "encrypted": encrypted,
                "table_count": dump.metadata.table_count,
                "data_rows": dump.metadata.data_rows,
            }
            manifest_path = Path(staging) / (name + ".metadata.json")
            manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            # Exclusive links prevent overwriting any existing backup. The
            # manifest is the completion marker; roll back a partial pair.
            for source in (ciphertext, manifest_path):
                target = output / source.name
                os.link(source, target)
                published.append(target)
        return manifest
    except (BackupError, OSError, ValueError, EOFError) as error:
        for path in published:
            path.unlink(missing_ok=True)
        if isinstance(error, BackupError):
            raise
        raise BackupError("Backup could not be written or published; no complete backup was created.") from None


def _load_manifest(backup_path):
    try:
        path = Path(str(backup_path) + ".metadata.json")
        if path.stat().st_size > 65536:
            raise ValueError
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict) or set(manifest) != {
            "schema_version", "created_at", "backup_file", "sql", "gzip", "encrypted", "table_count", "data_rows"
        }:
            raise ValueError
        if type(manifest["schema_version"]) is not int or manifest["schema_version"] != 1:
            raise ValueError
        if not isinstance(manifest["backup_file"], str) or not _BACKUP_NAME.fullmatch(manifest["backup_file"]):
            raise ValueError
        if manifest["backup_file"] != backup_path.name:
            raise ValueError
        if not isinstance(manifest["created_at"], str):
            raise ValueError
        datetime.strptime(manifest["created_at"], "%Y-%m-%dT%H:%M:%SZ")
        for field in ("sql", "gzip", "encrypted"):
            value = manifest[field]
            if not isinstance(value, dict) or set(value) != {"bytes", "sha256"}:
                raise ValueError
            if type(value["bytes"]) is not int or value["bytes"] <= 0:
                raise ValueError
            if not isinstance(value["sha256"], str) or not _DIGEST.fullmatch(value["sha256"]):
                raise ValueError
        if any(type(manifest[field]) is not int or manifest[field] <= 0 for field in ("table_count", "data_rows")):
            raise ValueError
        return manifest
    except (OSError, UnicodeError, ValueError, TypeError, KeyError):
        raise BackupError("Backup metadata is missing or invalid.") from None


def verify_backup(backup_path, identity_file, *, age="age"):
    """Decrypt in private temporary storage and verify every layer; never restore."""
    backup_path = Path(backup_path)
    manifest = _load_manifest(backup_path)
    try:
        if _file_metadata(backup_path) != manifest["encrypted"]:
            raise BackupError("Encrypted backup does not match its metadata.")
        with tempfile.TemporaryDirectory(prefix="backup-verify-private-") as private:
            archive_path = Path(private) / "database.sql.gz"
            sql_path = Path(private) / "database.sql"
            _age_run(age, ["--decrypt", "-i", str(identity_file), "-o", str(archive_path), str(backup_path)])
            if _file_metadata(archive_path) != manifest["gzip"]:
                raise BackupError("Decrypted archive does not match its metadata.")
            size = 0
            with gzip.open(archive_path, "rb") as archive, sql_path.open("wb") as destination:
                while chunk := archive.read(1024 * 1024):
                    size += len(chunk)
                    if size > manifest["sql"]["bytes"]:
                        raise BackupError("Decompressed backup exceeds its declared size.")
                    destination.write(chunk)
            metadata = validate_sql_dump(sql_path)
            if {"bytes": metadata.bytes, "sha256": metadata.sha256} != manifest["sql"]:
                raise BackupError("Decompressed backup does not match its metadata.")
            if (metadata.table_count, metadata.data_rows) != (manifest["table_count"], manifest["data_rows"]):
                raise BackupError("Database summary does not match its metadata.")
        return manifest
    except BackupError:
        raise
    except (OSError, ValueError, EOFError, zlib.error):
        raise BackupError("Backup verification failed; the encrypted files were left unchanged.") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("validate-config", help="Check URL and public recipients without connecting")
    check.add_argument("--recipient-file", type=Path, default=DEFAULT_RECIPIENTS)
    backup = commands.add_parser("backup", help="Create and encrypt a verified database dump")
    backup.add_argument("--output-dir", type=Path, required=True)
    backup.add_argument("--recipient-file", type=Path, default=DEFAULT_RECIPIENTS)
    backup.add_argument("--age", default="age")
    backup.add_argument("--pg-dump", default="pg_dump")
    verify = commands.add_parser("verify", help="Verify an encrypted backup locally without restoring")
    verify.add_argument("--backup", type=Path, required=True)
    verify.add_argument("--identity-file", type=Path, required=True)
    verify.add_argument("--age", default="age")
    args = parser.parse_args(argv)
    try:
        if args.command == "validate-config":
            result = validate_config(args.recipient_file)
        elif args.command == "backup":
            result = backup_to_directory(args.output_dir, args.recipient_file, age=args.age, pg_dump=args.pg_dump)
        else:
            result = verify_backup(args.backup, args.identity_file, age=args.age)
    except BackupError as error:
        print(f"Backup error: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
