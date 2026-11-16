"""Create and validate database dumps without disclosing credentials or SQL.

These checks establish that pg_dump completed and its compressed output is
intact. They do not replace a restore rehearsal in an isolated database.
"""

from dataclasses import dataclass
import gzip
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Sequence
from urllib.parse import unquote, urlsplit
import zlib


class BackupError(ValueError):
    """A safe, fixed diagnostic which never contains input or child output."""


@dataclass(frozen=True)
class DumpMetadata:
    bytes: int
    sha256: str
    table_count: int
    data_rows: int


@dataclass(frozen=True)
class DumpResult:
    sql_path: Path
    gzip_path: Path
    metadata: DumpMetadata


_QUERY_ENVIRONMENT = {
    "sslmode": "PGSSLMODE",
    "sslrootcert": "PGSSLROOTCERT",
    "sslcert": "PGSSLCERT",
    "sslkey": "PGSSLKEY",
    "sslcrl": "PGSSLCRL",
    "sslcrldir": "PGSSLCRLDIR",
    "channel_binding": "PGCHANNELBINDING",
}


def _connection_query(query: str) -> dict[str, str]:
    options = {}
    for entry in query.split("&") if query else ():
        key, separator, value = entry.partition("=")
        key, value = unquote(key, errors="strict"), unquote(value, errors="strict")
        # libpq percent-decodes query values but does not treat '+' as a space.
        if not separator or key not in _QUERY_ENVIRONMENT or not value or key in options:
            raise BackupError("Database connection URL contains unsupported or invalid options.")
        if key == "sslmode" and value not in ("require", "verify-ca", "verify-full"):
            raise BackupError("Database connection URL must require TLS.")
        if key == "channel_binding" and value not in ("disable", "prefer", "require"):
            raise BackupError("Database connection URL contains an invalid TLS option.")
        options[key] = value
    return options


def validate_database_url(database_url: str) -> str:
    """Reject malformed libpq URIs before invoking a credential-bearing tool."""
    invalid = "Invalid database connection URL; check its format and percent encoding."
    if not isinstance(database_url, str) or not database_url:
        raise BackupError("SUPABASE_DB_URL is empty or missing.")
    database_url = database_url.strip()
    if not database_url:
        raise BackupError("SUPABASE_DB_URL is empty or missing.")
    if not database_url.startswith(("postgres://", "postgresql://")):
        raise BackupError("SUPABASE_DB_URL must start with postgresql://. Paste the Session pooler URI only, without quotes.")
    if any(character.isspace() or ord(character) < 32 for character in database_url):
        raise BackupError("SUPABASE_DB_URL contains a space or line break inside the URI. Percent-encode spaces in the password.")
    if re.search(r"%(?![0-9a-fA-F]{2})", database_url):
        raise BackupError("SUPABASE_DB_URL contains an invalid percent escape. Percent-encode reserved characters in the password.")
    if re.match(r"^postgres(?:ql)?://[^:/?#@]+:(?:\[|%5B)YOUR-PASSWORD(?:\]|%5D)@", database_url, re.IGNORECASE):
        raise BackupError("Replace the [YOUR-PASSWORD] placeholder in SUPABASE_DB_URL with the database password.")
    try:
        parsed = urlsplit(database_url)
        port = parsed.port
        if (
            parsed.scheme not in ("postgres", "postgresql")
            or not parsed.username
            or not parsed.password
            or not parsed.hostname
            or parsed.netloc.count("@") != 1
            or (port is not None and not 1 <= port <= 65535)
            or not parsed.path.startswith("/")
            or not parsed.path[1:]
            or "/" in parsed.path[1:]
            or parsed.fragment
        ):
            raise ValueError
        if "\x00" in unquote(database_url, errors="strict"):
            raise ValueError
    except (ValueError, UnicodeError):
        raise BackupError(invalid) from None
    _connection_query(parsed.query)
    return database_url


_IDENTIFIER = rb'(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)'
_TABLE = rb"(" + _IDENTIFIER + rb")\.(" + _IDENTIFIER + rb")"
_CREATE_TABLE = re.compile(rb"^CREATE TABLE " + _TABLE + rb"(?:\s|\()")
_COPY = re.compile(rb"^COPY " + _TABLE + rb"\s+\(.*\) FROM stdin;$")
_UNRESTRICT = re.compile(rb"^\\unrestrict [A-Za-z0-9]+$")
_HEADER = b"-- PostgreSQL database dump"
_FOOTER = b"-- PostgreSQL database dump complete"


def _identifier(value: bytes) -> bytes:
    return value[1:-1].replace(b'""', b'"') if value.startswith(b'"') else value


def validate_sql_dump(path: str | os.PathLike) -> DumpMetadata:
    """Stream a plain pg_dump file and return only aggregate integrity metadata."""
    digest = hashlib.sha256()
    size = 0
    tables = set()
    header_seen = False
    footer_seen = False
    copy_table = None
    data_rows = 0
    try:
        with Path(path).open("rb") as source:
            for raw_line in source:
                digest.update(raw_line)
                size += len(raw_line)
                line = raw_line.rstrip(b"\r\n")
                if copy_table is not None:
                    if line == b"\\.":
                        copy_table = None
                    elif _COPY.fullmatch(line):
                        raise BackupError("Database dump contains an incomplete COPY section.")
                    elif copy_table in tables:
                        data_rows += 1
                    continue
                if footer_seen:
                    # Recent PostgreSQL releases close their safety guard after
                    # the completion marker. No more SQL or COPY data is valid.
                    if line and not line.startswith(b"--") and not _UNRESTRICT.fullmatch(line):
                        raise BackupError("Database dump contains content after its completion marker.")
                    continue
                if line == _HEADER:
                    header_seen = True
                elif line == _FOOTER:
                    footer_seen = True
                elif match := _CREATE_TABLE.match(line):
                    schema, table = (_identifier(part) for part in match.groups())
                    if schema == b"public":
                        tables.add((schema, table))
                elif match := _COPY.fullmatch(line):
                    copy_table = tuple(_identifier(part) for part in match.groups())
                elif line.startswith(b"COPY ") or line == b"\\.":
                    raise BackupError("Database dump has an invalid COPY section.")
    except OSError:
        raise BackupError("Database dump output is missing or unreadable.") from None
    if not size or not header_seen or not footer_seen or copy_table is not None:
        raise BackupError("Database dump is empty or incomplete.")
    if not {(b"public", b"rooms"), (b"public", b"bookings")}.issubset(tables):
        raise BackupError("Database dump is missing required application tables.")
    if not data_rows:
        raise BackupError("Database dump contains no application data rows.")
    return DumpMetadata(size, digest.hexdigest(), len(tables), data_rows)


def _dump_failure(stderr: bytes) -> BackupError:
    """Classify known failures without returning any original stderr text."""
    text = stderr.lower()
    if b"password authentication failed" in text or b"no password supplied" in text:
        category = "authentication"
    elif b"server version mismatch" in text or b"server version:" in text:
        category = "client/server version mismatch"
    elif any(item in text for item in (b"network is unreachable", b"could not translate host", b"connection", b"timeout")):
        category = "database connectivity"
    elif b"permission denied" in text:
        category = "database permissions"
    else:
        category = "database export"
    return BackupError(f"Database dump failed ({category}); no backup was created.")


def create_dump(
    database_url: str,
    temp_dir: str | os.PathLike,
    pg_dump: str | os.PathLike | Sequence[str] = "pg_dump",
) -> DumpResult:
    """Create verified SQL and gzip files in a unique caller-owned temp folder.

    The caller must encrypt/store the result and remove its parent directory.
    On failure this function removes the temporary files itself. A command
    sequence can select a wrapper executable; no shell is ever involved.
    """
    database_url = validate_database_url(database_url)
    work_dir = None
    try:
        parent = Path(temp_dir)
        parent.mkdir(parents=True, exist_ok=True)
        work_dir = Path(tempfile.mkdtemp(prefix="database-backup-", dir=parent))
        sql_path = work_dir / "database.sql"
        gzip_path = work_dir / "database.sql.gz"
        command = [os.fspath(pg_dump)] if isinstance(pg_dump, (str, os.PathLike)) else list(pg_dump)
        command.extend([
            "--no-owner", "--no-privileges", "--clean", "--if-exists",
            "--format=plain", "--file", str(sql_path),
        ])
        # libpq reads PGDATABASE literally after expanding explicit connection
        # parameters; a full URI in PGDATABASE alone is not a connection URI.
        # Use decoded individual environment fields, never credential argv.
        connection = urlsplit(database_url)
        environment = {
            key: value for key, value in os.environ.items()
            if not key.upper().startswith("PG") and key.upper() != "DATABASE_URL"
        }
        environment.update({
            "PGHOST": unquote(connection.hostname, errors="strict"),
            "PGPORT": str(connection.port or 5432),
            "PGUSER": unquote(connection.username, errors="strict"),
            "PGPASSWORD": unquote(connection.password, errors="strict"),
            "PGDATABASE": unquote(connection.path[1:], errors="strict"),
            "PGSSLMODE": "require",
            "PGCONNECT_TIMEOUT": "20",
        })
        environment.update({
            _QUERY_ENVIRONMENT[key]: value
            for key, value in _connection_query(connection.query).items()
        })
        try:
            result = subprocess.run(
                command, env=environment, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                shell=False, check=False, timeout=600,
            )
        except subprocess.TimeoutExpired:
            raise BackupError("Database dump timed out; no backup was created.") from None
        except OSError:
            raise BackupError("Database dump client could not be started.") from None
        if result.returncode:
            raise _dump_failure(result.stderr)
        metadata = validate_sql_dump(sql_path)
        with sql_path.open("rb") as source, gzip_path.open("wb") as destination:
            with gzip.GzipFile(filename="", mode="wb", fileobj=destination, mtime=0) as archive:
                shutil.copyfileobj(source, archive, length=1024 * 1024)
        decompressed_size = 0
        decompressed_digest = hashlib.sha256()
        with gzip.open(gzip_path, "rb") as archive:
            while chunk := archive.read(1024 * 1024):
                decompressed_size += len(chunk)
                decompressed_digest.update(chunk)
        if decompressed_size != metadata.bytes or decompressed_digest.hexdigest() != metadata.sha256:
            raise BackupError("Compressed database dump failed its integrity check.")
        return DumpResult(sql_path, gzip_path, metadata)
    except BackupError:
        if work_dir is not None:
            shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except (OSError, EOFError, ValueError, zlib.error):
        if work_dir is not None:
            shutil.rmtree(work_dir, ignore_errors=True)
        raise BackupError("Database backup could not be written or verified.") from None
