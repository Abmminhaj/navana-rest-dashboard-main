"""Synthetic backups only: real age, local fake pg_dump, no database connection."""

import contextlib
import gzip
import hashlib
import importlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

try:
    cli = importlib.import_module("scripts.backup_cli")
except ModuleNotFoundError:
    cli = None

REPO = Path(__file__).resolve().parents[1]
SQL = b"""-- PostgreSQL database dump
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
202
\\.
-- PostgreSQL database dump complete
"""
URL = "postgresql://fake:DO_NOT_DISCLOSE_PASSWORD@database.invalid:5432/postgres"


def executable(name, variable):
    configured = os.environ.get(variable)
    local = REPO.parent / "tooling" / "age" / "age" / (name + ".exe")
    return configured or (str(local) if local.is_file() else shutil.which(name))


class CliValidationTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(cli, "The backup CLI implementation is missing")

    def test_invalid_database_url_has_safe_nonzero_cli_result(self):
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"DATABASE_URL": URL + " invalid"}), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = cli.main(["validate-config"])
        self.assertEqual(status, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertNotIn("DO_NOT_DISCLOSE", stderr.getvalue())

    def test_private_identity_is_rejected_as_recipient_file_without_echoing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            recipients = Path(directory) / "recipient.txt"
            recipients.write_text("AGE-SECRET-KEY-DO_NOT_DISCLOSE\n", encoding="utf-8")
            with mock.patch.dict(os.environ, {"DATABASE_URL": URL}):
                with self.assertRaises(cli.BackupError) as caught:
                    cli.validate_config(recipients)
            self.assertNotIn("DO_NOT_DISCLOSE", str(caught.exception))

    def test_invalid_deflate_returns_safe_failure_and_cleans_private_decryption(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cipher = root / ("backup-2026-11-16T000000Z-" + "0" * 32 + ".sql.gz.age")
            cipher.write_bytes(b"synthetic cipher boundary fixture")
            malformed_gzip = bytes.fromhex("1f8b0800000000000003060000000000000000")
            manifest = {
                "schema_version": 1, "created_at": "2026-11-16T00:00:00Z", "backup_file": cipher.name,
                "sql": {"bytes": len(SQL), "sha256": hashlib.sha256(SQL).hexdigest()},
                "gzip": {"bytes": len(malformed_gzip), "sha256": hashlib.sha256(malformed_gzip).hexdigest()},
                "encrypted": {"bytes": cipher.stat().st_size, "sha256": hashlib.sha256(cipher.read_bytes()).hexdigest()},
                "table_count": 2, "data_rows": 2,
            }
            Path(str(cipher) + ".metadata.json").write_text(json.dumps(manifest), encoding="utf-8")
            decrypted = []

            def fake_decryption(age, arguments):
                path = Path(arguments[arguments.index("-o") + 1])
                path.write_bytes(malformed_gzip)
                decrypted.append(path)

            with mock.patch.object(cli, "_age_run", side_effect=fake_decryption):
                with self.assertRaises(cli.BackupError):
                    cli.verify_backup(cipher, root / "unused-identity")
            self.assertFalse(decrypted[0].parent.exists())


class AgeBackupTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(cli, "The backup CLI implementation is missing")
        self.age = executable("age", "AGE_EXE")
        keygen = executable("age-keygen", "AGE_KEYGEN_EXE")
        if not self.age or not keygen:
            self.skipTest("Install age and age-keygen, or set AGE_EXE and AGE_KEYGEN_EXE")
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.output = self.root / "output"
        self.identity = self.root / "identity.txt"
        subprocess.run([keygen, "-o", str(self.identity)], check=True, capture_output=True)
        recipient = subprocess.run([keygen, "-y", str(self.identity)], check=True,
                                   capture_output=True, text=True).stdout.strip()
        self.recipients = self.root / "recipients.txt"
        self.recipients.write_text("# Test public recipient\n" + recipient + "\n", encoding="utf-8")
        self.fake_dump = self.root / "fake_dump.py"
        self.path_log = self.root / "dump_path.txt"
        self.fake_dump.write_text(
            "import pathlib, sys\n"
            "path = pathlib.Path(sys.argv[sys.argv.index('--file') + 1])\n"
            f"path.write_bytes({SQL!r})\n"
            f"pathlib.Path({str(self.path_log)!r}).write_text(str(path))\n",
            encoding="utf-8",
        )
        self.environment = mock.patch.dict(os.environ, {"DATABASE_URL": URL})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def make_backup(self, **overrides):
        options = {"age": self.age, "pg_dump": [sys.executable, str(self.fake_dump)]}
        options.update(overrides)
        return cli.backup_to_directory(self.output, self.recipients, **options)

    def test_real_age_roundtrip_publishes_only_cipher_and_metadata_and_cleans_plaintext(self):
        manifest = self.make_backup()
        cipher = self.output / manifest["backup_file"]
        metadata_path = Path(str(cipher) + ".metadata.json")
        self.assertEqual(set(self.output.iterdir()), {cipher, metadata_path})
        self.assertRegex(cipher.name, r"^backup-\d{4}-\d{2}-\d{2}T\d{6}Z-[0-9a-f]{32}\.sql\.gz\.age$")
        self.assertTrue(cipher.read_bytes().startswith(b"age-encryption.org/v1\n"))
        self.assertNotIn(SQL, cipher.read_bytes())
        self.assertFalse(Path(self.path_log.read_text()).parent.exists())
        self.assertEqual(manifest["sql"], {"bytes": len(SQL), "sha256": hashlib.sha256(SQL).hexdigest()})
        self.assertEqual((manifest["table_count"], manifest["data_rows"]), (2, 2))
        self.assertEqual(json.loads(metadata_path.read_text()), manifest)
        self.assertEqual(cli.verify_backup(cipher, self.identity, age=self.age), manifest)

    def test_corrupted_cipher_is_rejected(self):
        manifest = self.make_backup()
        cipher = self.output / manifest["backup_file"]
        content = bytearray(cipher.read_bytes())
        content[-1] ^= 1
        cipher.write_bytes(content)
        with self.assertRaises(cli.BackupError):
            cli.verify_backup(cipher, self.identity, age=self.age)

    def test_manifest_tampering_with_each_integrity_layer_is_rejected(self):
        manifest = self.make_backup()
        cipher = self.output / manifest["backup_file"]
        path = Path(str(cipher) + ".metadata.json")
        for field, member in ((field, member) for field in ("encrypted", "gzip", "sql")
                              for member in ("sha256", "bytes")):
            with self.subTest(field=field, member=member):
                changed = json.loads(json.dumps(manifest))
                changed[field][member] = "0" * 64 if member == "sha256" else changed[field][member] + 1
                path.write_text(json.dumps(changed), encoding="utf-8")
                with self.assertRaises(cli.BackupError):
                    cli.verify_backup(cipher, self.identity, age=self.age)

    def test_corrupt_gzip_is_fully_checked_even_with_matching_outer_checksums(self):
        manifest = self.make_backup()
        cipher = self.output / manifest["backup_file"]
        archive = self.root / "corrupt.sql.gz"
        corrupt_archives = (gzip.compress(SQL)[:-3], bytes.fromhex("1f8b0800000000000003060000000000000000"))
        for index, content in enumerate(corrupt_archives):
            with self.subTest(kind=index):
                archive.write_bytes(content)
                replacement = self.root / f"replacement-{index}.age"
                subprocess.run([self.age, "-R", str(self.recipients), "-o", str(replacement), str(archive)],
                               check=True, capture_output=True)
                cipher.write_bytes(replacement.read_bytes())
                for field, path in (("gzip", archive), ("encrypted", cipher)):
                    data = path.read_bytes()
                    manifest[field] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                Path(str(cipher) + ".metadata.json").write_text(json.dumps(manifest), encoding="utf-8")
                with self.assertRaises(cli.BackupError):
                    cli.verify_backup(cipher, self.identity, age=self.age)

    def test_wrong_identity_cannot_verify_or_leave_decrypted_files(self):
        manifest = self.make_backup()
        self.identity.write_text("AGE-SECRET-KEY-DO_NOT_DISCLOSE\n", encoding="utf-8")
        with self.assertRaises(cli.BackupError) as caught:
            cli.verify_backup(self.output / manifest["backup_file"], self.identity, age=self.age)
        self.assertNotIn("DO_NOT_DISCLOSE", str(caught.exception))
        self.assertEqual(len(list(self.output.iterdir())), 2)

    def test_partial_publication_is_rolled_back(self):
        real_link = os.link
        count = 0

        def fail_manifest_link(source, target):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("DO_NOT_DISCLOSE")
            return real_link(source, target)

        with mock.patch.object(cli.os, "link", side_effect=fail_manifest_link):
            with self.assertRaises(cli.BackupError) as caught:
                self.make_backup()
        self.assertNotIn("DO_NOT_DISCLOSE", str(caught.exception))
        self.assertEqual(list(self.output.iterdir()), [])
        self.assertFalse(Path(self.path_log.read_text()).parent.exists())

    def test_manifest_with_untrusted_extra_data_is_not_returned(self):
        manifest = self.make_backup()
        cipher = self.output / manifest["backup_file"]
        manifest["customer_data"] = "DO_NOT_DISCLOSE"
        Path(str(cipher) + ".metadata.json").write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaises(cli.BackupError) as caught:
            cli.verify_backup(cipher, self.identity, age=self.age)
        self.assertNotIn("DO_NOT_DISCLOSE", str(caught.exception))

    def test_failed_age_publishes_nothing_and_cleans_plaintext(self):
        failure = self.root / "fail_age.py"
        failure.write_text("import sys\nsys.stderr.write('DO_NOT_DISCLOSE_PASSWORD')\nsys.exit(1)\n")
        with self.assertRaises(cli.BackupError) as caught:
            self.make_backup(age=[sys.executable, str(failure)])
        self.assertNotIn("DO_NOT_DISCLOSE", str(caught.exception))
        self.assertEqual(list(self.output.iterdir()), [])
        self.assertFalse(Path(self.path_log.read_text()).parent.exists())

    def test_output_in_git_worktree_is_rejected_before_dump(self):
        with self.assertRaises(cli.BackupError):
            cli.backup_to_directory(REPO / "backup-output", self.recipients, age=self.age,
                                    pg_dump=[sys.executable, str(self.fake_dump)])
        self.assertFalse(self.path_log.exists())

    def test_preflight_needs_no_tools_and_returns_no_credentials(self):
        result = cli.validate_config(self.recipients)
        self.assertEqual(result, {"database_url_valid": True, "recipients": 1})

    def test_cli_verify_returns_metadata_without_reading_database_url(self):
        manifest = self.make_backup()
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"DATABASE_URL": "invalid"}), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            status = cli.main(["verify", "--backup", str(self.output / manifest["backup_file"]),
                               "--identity-file", str(self.identity), "--age", self.age])
        self.assertEqual(status, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertEqual(json.loads(stdout.getvalue()), manifest)


if __name__ == "__main__":
    unittest.main()
