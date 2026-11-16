"""Backup checks use synthetic SQL and a local fake pg_dump, never a database."""

import contextlib
import gzip
import hashlib
import importlib
import io
import os
from pathlib import Path
import sys
import tempfile
import traceback
import unittest
from unittest import mock
import zlib


try:
    backup = importlib.import_module("scripts.database_backup")
except ModuleNotFoundError:
    backup = None


SQL = b"""--
-- PostgreSQL database dump
--
CREATE TABLE public.rooms (
    id integer
);
CREATE TABLE public.bookings (
    id integer
);
COPY public.rooms (id) FROM stdin;
101
\\.
COPY public.bookings (id) FROM stdin;
\\.
--
-- PostgreSQL database dump complete
--
"""
URL = "postgresql://postgres.example:fake%20password@pooler.example:5432/postgres"


class BackupTestCase(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(backup, "The database backup implementation is missing")
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def write_sql(self, content=SQL):
        path = self.root / "input.sql"
        path.write_bytes(content)
        return path


class ConnectionValidationTests(BackupTestCase):
    def test_accepts_percent_encoded_credentials_and_ipv6(self):
        for url in (
            URL,
            "postgres://user:p%40ss%3Aword@[2001:db8::1]/application",
            URL + "?sslmode=verify-full&sslrootcert=%2Fcert.pem",
        ):
            with self.subTest(url_kind=url.split(":", 1)[0]):
                self.assertEqual(backup.validate_database_url(url), url)

    def test_trims_clipboard_whitespace_around_the_uri(self):
        self.assertEqual(backup.validate_database_url("  " + URL + "\r\n"), URL)

    def test_rejects_malformed_urls_without_disclosing_credentials(self):
        marker = "DO_NOT_DISCLOSE_PASSWORD"
        invalid = (
            "",
            f"postgresql://user:{marker} extra@host/database",
            f"postgresql://user:{marker}\n@host/database",
            f"postgresql://user:{marker}%ZZ@host/database",
            f"postgresql://user:{marker}%0@host/database",
            f"postgresql://user:{marker}%00@host/database",
            f"https://user:{marker}@host/database",
            f"postgresql://user:{marker}@host:0/database",
            f"postgresql://user:{marker}@host:65536/database",
            f"postgresql://user:{marker}@host:abc/database",
            f"postgresql://user:{marker}@host/",
            f"postgresql://user:{marker}@/database",
            f"postgresql://user:{marker}@host/database#fragment",
            f"postgresql://user:{marker}@host/database?sslmode=disable",
            f"postgresql://user:{marker}@host/database?host=other.example",
            f"postgresql://user:{marker}@host/database?connect_timeout=0",
            f"postgresql://user:{marker}@host/database?sslmode=require&sslmode=require",
            f"postgresql://user:{marker}@host/database?channel_binding=unknown",
            f"postgresql://user:{marker}@host/database?sslrootcert=",
            f"postgresql://user:{marker}@host/database?sslrootcert",
            "postgresql://user@host/database",
            "postgresql://:password@host/database",
        )
        for url in invalid:
            with self.subTest(case=invalid.index(url)):
                try:
                    backup.validate_database_url(url)
                except backup.BackupError as error:
                    self.assertNotIn(marker, str(error))
                    self.assertNotIn(marker, "".join(traceback.format_exception(error)))
                else:
                    self.fail("Invalid database URL was accepted")


class SqlValidationTests(BackupTestCase):
    def test_returns_only_aggregate_metadata_for_complete_dump(self):
        metadata = backup.validate_sql_dump(self.write_sql())
        self.assertEqual(metadata.bytes, len(SQL))
        self.assertEqual(metadata.sha256, hashlib.sha256(SQL).hexdigest())
        self.assertEqual(metadata.table_count, 2)
        self.assertEqual(metadata.data_rows, 1)
        self.assertNotIn("101", repr(metadata))

    def test_accepts_quoted_table_names_and_crlf(self):
        sql = SQL.replace(b"public.rooms", b'"public"."rooms"').replace(
            b"public.bookings", b'"public"."bookings"'
        ).replace(b"\n", b"\r\n")
        self.assertEqual(backup.validate_sql_dump(self.write_sql(sql)).data_rows, 1)

    def test_rejects_empty_missing_schema_header_or_footer(self):
        invalid = (
            b"",
            SQL.replace(b"-- PostgreSQL database dump\n", b""),
            SQL.replace(b"-- PostgreSQL database dump complete", b""),
            SQL.replace(b"CREATE TABLE public.bookings", b"CREATE TABLE public.other"),
            SQL.replace(b"CREATE TABLE public.rooms", b"CREATE TABLE public.other"),
            SQL.replace(b"101\n", b""),
        )
        for index, sql in enumerate(invalid):
            with self.subTest(case=index), self.assertRaises(backup.BackupError):
                backup.validate_sql_dump(self.write_sql(sql))

    def test_rejects_incomplete_copy_even_with_footer_present(self):
        sql = SQL.replace(b"101\n\\.\n", b"101\n")
        with self.assertRaises(backup.BackupError):
            backup.validate_sql_dump(self.write_sql(sql))

    def test_rejects_data_or_incomplete_statements_after_footer(self):
        with self.assertRaises(backup.BackupError):
            backup.validate_sql_dump(self.write_sql(SQL + b"COPY public.rooms (id) FROM stdin;\n"))

    def test_non_application_rows_do_not_satisfy_nonempty_requirement(self):
        sql = SQL.replace(b"101\n", b"").replace(
            b"-- PostgreSQL database dump complete",
            b"COPY auth.users (id) FROM stdin;\n1\n\\.\n-- PostgreSQL database dump complete",
        )
        with self.assertRaises(backup.BackupError):
            backup.validate_sql_dump(self.write_sql(sql))


class DumpExecutionTests(BackupTestCase):
    def setUp(self):
        super().setUp()
        self.fixture = self.write_sql()
        self.fake = self.root / "fake_pg_dump.py"
        self.fake.write_text(
            "import os, pathlib, sys\n"
            "args = sys.argv[1:]\n"
            "required = {'--no-owner', '--no-privileges', '--clean', '--if-exists', '--format=plain'}\n"
            "assert required.issubset(args)\n"
            "assert os.environ['PGDATABASE'] == 'postgres'\n"
            "assert os.environ['PGHOST'] == 'pooler.example'\n"
            "assert os.environ['PGPORT'] == '5432'\n"
            "assert os.environ['PGUSER'] == 'postgres.example'\n"
            "assert os.environ['PGPASSWORD'] == 'fake password'\n"
            "assert 'PGSERVICE' not in os.environ and 'PGHOSTADDR' not in os.environ\n"
            "assert 'PGOPTIONS' not in os.environ\n"
            "assert os.environ['PGSSLMODE'] == 'require'\n"
            "assert os.environ['PGCONNECT_TIMEOUT'] == '20'\n"
            "assert all('fake%20password' not in arg and 'fake password' not in arg and 'postgresql://' not in arg for arg in args)\n"
            "mode = os.environ.get('FAKE_DUMP_MODE', 'success')\n"
            "data = pathlib.Path(os.environ['FAKE_DUMP_SQL']).read_bytes()\n"
            "target = pathlib.Path(args[args.index('--file') + 1])\n"
            "if mode != 'missing': target.write_bytes(b'' if mode == 'empty' else data[:70] if mode == 'partial' else data)\n"
            "print('DO_NOT_DISCLOSE_STDOUT')\n"
            "if mode == 'failure':\n"
            "    print('password authentication failed DO_NOT_DISCLOSE_STDERR', file=sys.stderr)\n"
            "    sys.exit(1)\n",
            encoding="utf-8",
        )
        self.output = self.root / "outputs"
        self.output.mkdir()
        self.environment = mock.patch.dict(os.environ, {
            "FAKE_DUMP_SQL": str(self.fixture),
            "FAKE_DUMP_MODE": "success",
            "PGSERVICE": "unrelated-service",
            "PGHOSTADDR": "127.0.0.1",
            "PGOPTIONS": "unrelated-options",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def run_dump(self):
        return backup.create_dump(URL, self.output, pg_dump=(sys.executable, str(self.fake)))

    def test_success_uses_safe_process_arguments_and_verifies_gzip_roundtrip(self):
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            result = self.run_dump()
        self.assertEqual(captured.getvalue(), "")
        self.assertEqual(result.sql_path.read_bytes(), SQL)
        with gzip.open(result.gzip_path, "rb") as archive:
            restored = archive.read()
        self.assertEqual(restored, SQL)
        self.assertEqual(result.metadata.sha256, hashlib.sha256(restored).hexdigest())
        self.assertEqual(result.metadata.data_rows, 1)

    def test_failed_dump_never_leaks_child_output_or_leaves_publishable_files(self):
        with mock.patch.dict(os.environ, {"FAKE_DUMP_MODE": "failure"}):
            try:
                self.run_dump()
            except backup.BackupError as error:
                text = "".join(traceback.format_exception(error))
                self.assertIn("authentication", str(error).lower())
                self.assertNotIn("DO_NOT_DISCLOSE", text)
            else:
                self.fail("A failed pg_dump was accepted")
        self.assertEqual(list(self.output.iterdir()), [])

    def test_success_exit_with_missing_empty_or_partial_output_is_rejected(self):
        for mode in ("missing", "empty", "partial"):
            with self.subTest(mode=mode), mock.patch.dict(os.environ, {"FAKE_DUMP_MODE": mode}):
                with self.assertRaises(backup.BackupError):
                    self.run_dump()
                self.assertEqual(list(self.output.iterdir()), [])

    def test_missing_executable_is_safe_and_cleans_partial_directory(self):
        with self.assertRaises(backup.BackupError):
            backup.create_dump(URL, self.output, pg_dump=str(self.root / "missing-executable"))
        self.assertEqual(list(self.output.iterdir()), [])

    def test_preserves_explicit_tls_parameters_in_environment(self):
        self.fake.write_text(
            self.fake.read_text(encoding="utf-8").replace(
                "assert os.environ['PGSSLMODE'] == 'require'",
                "assert os.environ['PGSSLMODE'] == 'verify-full'\n"
                "assert os.environ['PGSSLROOTCERT'] == '/certificate+authority.pem'\n"
                "assert os.environ['PGCHANNELBINDING'] == 'require'",
            ), encoding="utf-8",
        )
        url = URL + "?sslmode=verify-full&sslrootcert=%2Fcertificate+authority.pem&channel_binding=require"
        result = backup.create_dump(url, self.output, pg_dump=(sys.executable, str(self.fake)))
        self.assertEqual(result.metadata.data_rows, 1)

    def test_gzip_decoder_failure_is_safe_and_cleans_plaintext(self):
        with mock.patch.object(backup.gzip, "open", side_effect=zlib.error("DO_NOT_DISCLOSE_DECODER_DETAIL")):
            try:
                self.run_dump()
            except backup.BackupError as error:
                self.assertNotIn("DO_NOT_DISCLOSE", "".join(traceback.format_exception(error)))
            else:
                self.fail("A corrupt compressed dump was accepted")
        self.assertEqual(list(self.output.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
