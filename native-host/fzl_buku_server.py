#!/usr/bin/env python3
"""
fzl_buku_server.py - Lightweight HTTP REST Bridge for FZL Emacs Buku
Serves on 127.0.0.1:8765 to allow extension communication via standard fetch()
as a fallback or alternative to Native Messaging.
Uses standard library only (no pip dependencies required).
"""

import sys
import os
import json
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any

# Import handlers from native host
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

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
    resolve_db_path,
    resolve_buku_bin,
    resolve_emacsclient,
)

PORT = 8765
HOST = "127.0.0.1"

class BukuRequestHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def send_json_response(self, status_code: int, data: Dict[str, Any]):
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.wfile.write(body)

    def parse_body_json(self) -> Dict[str, Any]:
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len > 0:
            raw = self.rfile.read(content_len).decode("utf-8")
            try:
                return json.loads(raw)
            except Exception:
                return {}
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        path = parsed.path.rstrip("/")

        def p_get(key: str, default: str = "") -> str:
            return params.get(key, [default])[0]

        if path in ("/api/status", "/api/ping", ""):
            res = handle_ping({"db_path": p_get("db_path"), "buku_bin": p_get("buku_bin"), "emacsclient_bin": p_get("emacsclient_bin")})
            self.send_json_response(200, res)

        elif path == "/api/bookmarks":
            res = handle_get_bookmarks({
                "query": p_get("q") or p_get("query"),
                "tag": p_get("tag"),
                "limit": p_get("limit", "1000"),
                "db_path": p_get("db_path")
            })
            self.send_json_response(200 if res.get("success") else 500, res)

        elif path == "/api/tags":
            res = handle_get_tags({"db_path": p_get("db_path")})
            self.send_json_response(200 if res.get("success") else 500, res)

        elif path == "/api/check-url":
            res = handle_check_url({"url": p_get("url"), "db_path": p_get("db_path")})
            self.send_json_response(200, res)

        else:
            self.send_json_response(404, {"success": False, "error": f"Endpoint not found: {self.path}"})

    def do_POST(self):
        path = self.path.rstrip("/")
        data = self.parse_body_json()

        if path == "/api/bookmarks":
            res = handle_add_bookmark(data)
            self.send_json_response(200 if res.get("success") else 400, res)

        elif path == "/api/batch":
            res = handle_add_batch(data)
            self.send_json_response(200 if res.get("success") else 400, res)

        elif path == "/api/emacs":
            res = handle_open_in_emacs(data)
            self.send_json_response(200 if res.get("success") else 500, res)

        elif path == "/api/delete":
            res = handle_delete_bookmark(data)
            self.send_json_response(200 if res.get("success") else 400, res)

        elif path == "/api/update":
            res = handle_update_bookmark(data)
            self.send_json_response(200 if res.get("success") else 400, res)

        else:
            self.send_json_response(404, {"success": False, "error": f"Endpoint not found: {self.path}"})

    def log_message(self, format, *args):
        # Override to suppress default noisy stdout logging
        pass

def run_server():
    server_address = (HOST, PORT)
    httpd = HTTPServer(server_address, BukuRequestHandler)
    print(f"FZL Emacs Buku HTTP Bridge running on http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down HTTP Bridge...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
