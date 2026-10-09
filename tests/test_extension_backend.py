#!/usr/bin/env python3
"""
test_extension_backend.py - Integration test suite for FZL Emacs Buku backend
Tests SQLite direct queries, Buku CLI operations, Native Host protocol framing,
and HTTP bridge handlers against an isolated temporary database.
"""

import unittest
import tempfile
import os
import sys
import json
import sqlite3
import subprocess
import struct
import io

# Setup paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "native-host"))

from fzl_buku_native_host import (
    handle_ping,
    handle_get_bookmarks,
    handle_get_tags,
    handle_check_url,
    handle_add_bookmark,
    handle_add_batch,
    handle_delete_bookmark,
    handle_update_bookmark,
    handle_open_in_emacs,
    read_message,
    send_message,
    dispatch_message,
    parse_tags_string,
    format_tags_for_sqlite,
)

class TestFzlEmacsBuku(unittest.TestCase):
    def setUp(self):
        # Create a temporary SQLite database mimicking Buku schema
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self.temp_db.name
        self.temp_db.close()

        # Initialize schema
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE bookmarks (
                id integer PRIMARY KEY,
                URL text NOT NULL UNIQUE,
                metadata text default '',
                tags text default ',',
                desc text default '',
                flags integer default 0
            )
        """)
        # Insert initial fixtures
        cur.execute("""
            INSERT INTO bookmarks (id, URL, metadata, tags, desc, flags)
            VALUES (1, 'https://gnu.org', 'GNU Project', ',emacs,foss,', 'Free software foundation', 0)
        """)
        cur.execute("""
            INSERT INTO bookmarks (id, URL, metadata, tags, desc, flags)
            VALUES (2, 'https://github.com', 'GitHub', ',dev,git,', 'Code hosting', 0)
        """)
        conn.commit()
        conn.close()

    def tearDown(self):
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_tag_formatting_and_parsing(self):
        tags_raw = ",emacs,lisp,dev,"
        parsed = parse_tags_string(tags_raw)
        self.assertEqual(parsed, ["dev", "emacs", "lisp"])

        formatted = format_tags_for_sqlite(["lisp", "emacs", "dev"])
        self.assertEqual(formatted, ",dev,emacs,lisp,")

    def test_ping(self):
        res = handle_ping({"db_path": self.db_path})
        self.assertTrue(res["success"])
        self.assertEqual(res["total_bookmarks"], 2)
        self.assertEqual(res["total_tags"], 4)

    def test_get_bookmarks_all(self):
        res = handle_get_bookmarks({"db_path": self.db_path})
        self.assertTrue(res["success"])
        self.assertEqual(len(res["bookmarks"]), 2)
        urls = [b["url"] for b in res["bookmarks"]]
        self.assertIn("https://gnu.org", urls)
        self.assertIn("https://github.com", urls)

    def test_get_bookmarks_filter_tag(self):
        res = handle_get_bookmarks({"db_path": self.db_path, "tag": "emacs"})
        self.assertTrue(res["success"])
        self.assertEqual(len(res["bookmarks"]), 1)
        self.assertEqual(res["bookmarks"][0]["url"], "https://gnu.org")

    def test_get_bookmarks_search_query(self):
        res = handle_get_bookmarks({"db_path": self.db_path, "query": "code hosting"})
        self.assertTrue(res["success"])
        self.assertEqual(len(res["bookmarks"]), 1)
        self.assertEqual(res["bookmarks"][0]["url"], "https://github.com")

    def test_check_url(self):
        res_exists = handle_check_url({"db_path": self.db_path, "url": "https://gnu.org"})
        self.assertTrue(res_exists["bookmarked"])
        self.assertEqual(res_exists["bookmark"]["id"], 1)

        res_none = handle_check_url({"db_path": self.db_path, "url": "https://nonexistent.org"})
        self.assertFalse(res_none["bookmarked"])

    def test_add_new_bookmark(self):
        res = handle_add_bookmark({
            "db_path": self.db_path,
            "url": "https://archlinux.org",
            "title": "Arch Linux",
            "tags": "linux,distro",
            "description": "Rolling release"
        })
        self.assertTrue(res["success"])

        # Verify in DB
        check = handle_check_url({"db_path": self.db_path, "url": "https://archlinux.org"})
        self.assertTrue(check["bookmarked"])
        self.assertIn("linux", check["bookmark"]["tags"])
        self.assertIn("distro", check["bookmark"]["tags"])

    def test_add_duplicate_bookmark_appends_tags(self):
        # Adding existing URL with new tag 'orgmode'
        res = handle_add_bookmark({
            "db_path": self.db_path,
            "url": "https://gnu.org",
            "tags": "orgmode"
        })
        self.assertTrue(res["success"])
        self.assertEqual(res["action"], "updated")

        check = handle_check_url({"db_path": self.db_path, "url": "https://gnu.org"})
        self.assertIn("orgmode", check["bookmark"]["tags"])
        self.assertIn("emacs", check["bookmark"]["tags"])

    def test_add_batch_bookmarks(self):
        items = [
            {"url": "https://site1.org", "title": "Site 1"},
            {"url": "https://site2.org", "title": "Site 2"},
            {"url": "https://site3.org", "title": "Site 3"},
        ]
        res = handle_add_batch({
            "db_path": self.db_path,
            "bookmarks": items,
            "tag": "batch-test"
        })
        self.assertTrue(res["success"])
        self.assertEqual(res["saved"], 3)

        tags_res = handle_get_tags({"db_path": self.db_path})
        tag_names = [t["name"] for t in tags_res["tags"]]
        self.assertIn("batch-test", tag_names)

    def test_update_bookmark(self):
        res = handle_update_bookmark({
            "db_path": self.db_path,
            "id": 1,
            "title": "GNU Operating System (Updated)",
            "tags": "gnu,emacs,free",
            "description": "Updated description"
        })
        self.assertTrue(res["success"])

        bm = handle_check_url({"db_path": self.db_path, "url": "https://gnu.org"})["bookmark"]
        self.assertEqual(bm["title"], "GNU Operating System (Updated)")
        self.assertIn("free", bm["tags"])

    def test_delete_bookmark(self):
        res = handle_delete_bookmark({
            "db_path": self.db_path,
            "id": 2
        })
        self.assertTrue(res["success"])

        check = handle_check_url({"db_path": self.db_path, "url": "https://github.com"})
        self.assertFalse(check["bookmarked"])

    def test_native_messaging_framing(self):
        payload = {"action": "ping", "db_path": self.db_path}
        encoded = json.dumps(payload).encode("utf-8")
        packet = struct.pack("@I", len(encoded)) + encoded

        # Mock stdin and stdout
        orig_stdin = sys.stdin
        orig_stdout = sys.stdout
        class MockIO:
            def __init__(self, buf):
                self.buffer = buf

        try:
            sys.stdin = MockIO(io.BytesIO(packet))
            
            read_res = read_message()
            self.assertEqual(read_res["action"], "ping")

            # Dispatch
            dispatch_res = dispatch_message(read_res)
            self.assertTrue(dispatch_res["success"])
            self.assertEqual(dispatch_res["total_bookmarks"], 2)

            # Test send
            mock_out = io.BytesIO()
            sys.stdout = MockIO(mock_out)
            send_message(dispatch_res)

            mock_out.seek(0)
            length = struct.unpack("@I", mock_out.read(4))[0]
            out_data = json.loads(mock_out.read(length).decode("utf-8"))
            self.assertTrue(out_data["success"])
        finally:
            sys.stdin = orig_stdin
            sys.stdout = orig_stdout

if __name__ == "__main__":
    unittest.main()
