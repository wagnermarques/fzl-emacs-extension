#!/usr/bin/env python3
"""
fzl_buku_native_host.py - Native Messaging Host for FZL Emacs Buku Bookmarks
Communicates with Chromium (Chrome/Brave/Edge) and Mozilla Firefox via stdio
using the standard WebExtensions Native Messaging protocol.
"""

import sys
import os
import json
import struct
import sqlite3
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# Default locations
DEFAULT_EMACS_REPO_DB = "/home/wgn/mnt/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/bookmarks/bookmarks.db"
DEFAULT_BUKU_CLI = "/home/wgn/.local/bin/buku"
DEFAULT_EMACSCLIENT = "/home/wgn/WORKING/Progsativos/ides/emacs/bin/emacsclient"
CONFIG_FILE = os.path.expanduser("~/.config/fzl-emacs-buku/config.json")
LOG_FILE = os.path.expanduser("~/.cache/fzl-emacs-buku/host.log")

def log(msg: str):
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{os.getpid()}] {msg}\n")
    except Exception:
        pass

def load_user_config() -> Dict[str, Any]:
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log(f"Failed to load user config: {e}")
    return {}

def resolve_db_path(custom_path: Optional[str] = None) -> str:
    cfg = load_user_config()
    candidates = [
        custom_path,
        cfg.get("db_path"),
        os.environ.get("BUKU_DB_PATH"),
        DEFAULT_EMACS_REPO_DB,
        os.path.expanduser("~/.local/share/buku/bookmarks.db"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)
    # Fallback to default emacs repo path even if not yet created
    return custom_path or cfg.get("db_path") or DEFAULT_EMACS_REPO_DB

def resolve_buku_bin(custom_path: Optional[str] = None) -> str:
    cfg = load_user_config()
    candidates = [
        custom_path,
        cfg.get("buku_bin"),
        DEFAULT_BUKU_CLI,
        shutil.which("buku"),
    ]
    for c in candidates:
        if c and (os.path.isfile(c) or shutil.which(c)):
            return c
    return "buku"

def resolve_emacsclient(custom_path: Optional[str] = None) -> str:
    cfg = load_user_config()
    candidates = [
        custom_path,
        cfg.get("emacsclient_bin"),
        DEFAULT_EMACSCLIENT,
        shutil.which("emacsclient"),
    ]
    for c in candidates:
        if c and (os.path.isfile(c) or shutil.which(c)):
            return c
    return "emacsclient"

def is_emacs_server_active(emacsclient_bin: str) -> bool:
    try:
        proc = subprocess.run(
            [emacsclient_bin, "-e", "t"],
            capture_output=True,
            text=True,
            timeout=1.5
        )
        return proc.returncode == 0
    except Exception:
        return False

def get_db_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def parse_tags_string(raw_tags: Optional[str]) -> List[str]:
    """Buku stores tags as ',tag1,tag2,' in SQLite or 'tag1,tag2' in CLI."""
    if not raw_tags:
        return []
    tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
    return sorted(list(set(tags)))

def format_tags_for_sqlite(tags: List[str]) -> str:
    """Format tags list into Buku SQLite storage format: ,tag1,tag2,"""
    clean = sorted([t.strip().lower() for t in tags if t.strip()])
    if not clean:
        return ","
    return "," + ",".join(clean) + ","

# -----------------------------------------------------------------------------
# Message Handlers
# -----------------------------------------------------------------------------

def handle_ping(data: Dict[str, Any]) -> Dict[str, Any]:
    db_path = resolve_db_path(data.get("db_path"))
    buku_bin = resolve_buku_bin(data.get("buku_bin"))
    emacsclient_bin = resolve_emacsclient(data.get("emacsclient_bin"))
    db_exists = os.path.isfile(db_path)
    
    count = 0
    tags_count = 0
    if db_exists:
        try:
            with get_db_connection(db_path) as conn:
                cur = conn.cursor()
                count = cur.execute("SELECT count(*) FROM bookmarks").fetchone()[0]
                # count distinct tags
                rows = cur.execute("SELECT tags FROM bookmarks WHERE tags != ','").fetchall()
                all_tags = set()
                for r in rows:
                    all_tags.update(parse_tags_string(r["tags"]))
                tags_count = len(all_tags)
        except Exception as e:
            log(f"Ping DB query error: {e}")
            
    buku_avail = bool(shutil.which(buku_bin) or (os.path.isfile(buku_bin) and os.access(buku_bin, os.X_OK)))
    emacs_active = is_emacs_server_active(emacsclient_bin)
    
    return {
        "success": True,
        "action": "ping",
        "version": "1.0.0",
        "db_path": db_path,
        "db_exists": db_exists,
        "total_bookmarks": count,
        "total_tags": tags_count,
        "buku_bin": buku_bin,
        "buku_available": buku_avail,
        "emacsclient_bin": emacsclient_bin,
        "emacs_server_active": emacs_active,
    }

def handle_get_bookmarks(data: Dict[str, Any]) -> Dict[str, Any]:
    db_path = resolve_db_path(data.get("db_path"))
    query = (data.get("query") or "").strip().lower()
    tag_filter = (data.get("tag") or "").strip().lower()
    limit = int(data.get("limit") or 1000)

    if not os.path.isfile(db_path):
        return {
            "success": False,
            "error": f"Database file not found at: {db_path}",
            "bookmarks": []
        }

    try:
        with get_db_connection(db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, URL, metadata, tags, desc, flags FROM bookmarks ORDER BY id DESC LIMIT ?", (limit,))
            rows = cur.fetchall()
            
            bookmarks = []
            for r in rows:
                item_tags = parse_tags_string(r["tags"])
                title = r["metadata"] or ""
                url = r["URL"] or ""
                desc = r["desc"] or ""
                
                # Filter by tag if requested
                if tag_filter and tag_filter != "all":
                    if tag_filter not in [t.lower() for t in item_tags]:
                        continue
                
                # Filter by search query if requested
                if query:
                    searchable = f"{title} {url} {desc} {' '.join(item_tags)}".lower()
                    terms = query.split()
                    if not all(term in searchable for term in terms):
                        continue
                        
                bookmarks.append({
                    "id": r["id"],
                    "url": url,
                    "title": title or url,
                    "tags": item_tags,
                    "description": desc,
                    "flags": r["flags"]
                })

            return {
                "success": True,
                "count": len(bookmarks),
                "bookmarks": bookmarks
            }
    except Exception as e:
        log(f"Error fetching bookmarks: {e}")
        return {"success": False, "error": str(e), "bookmarks": []}

def handle_get_tags(data: Dict[str, Any]) -> Dict[str, Any]:
    db_path = resolve_db_path(data.get("db_path"))
    if not os.path.isfile(db_path):
        return {"success": False, "error": "Database not found", "tags": []}

    try:
        with get_db_connection(db_path) as conn:
            cur = conn.cursor()
            rows = cur.execute("SELECT tags FROM bookmarks WHERE tags != ','").fetchall()
            tag_counts: Dict[str, int] = {}
            for r in rows:
                tags = parse_tags_string(r["tags"])
                for t in tags:
                    tag_counts[t] = tag_counts.get(t, 0) + 1
                    
            sorted_tags = [
                {"name": name, "count": count}
                for name, count in sorted(tag_counts.items(), key=lambda x: (-x[1], x[0]))
            ]
            return {"success": True, "tags": sorted_tags}
    except Exception as e:
        log(f"Error getting tags: {e}")
        return {"success": False, "error": str(e), "tags": []}

def handle_check_url(data: Dict[str, Any]) -> Dict[str, Any]:
    url = (data.get("url") or "").strip()
    db_path = resolve_db_path(data.get("db_path"))
    if not url or not os.path.isfile(db_path):
        return {"success": True, "bookmarked": False, "bookmark": None}

    # Normalize url (strip trailing slash for comparison if needed)
    try:
        with get_db_connection(db_path) as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, URL, metadata, tags, desc, flags FROM bookmarks WHERE URL = ? OR URL = ? LIMIT 1",
                (url, url.rstrip("/"))
            )
            row = cur.fetchone()
            if row:
                return {
                    "success": True,
                    "bookmarked": True,
                    "bookmark": {
                        "id": row["id"],
                        "url": row["URL"],
                        "title": row["metadata"] or "",
                        "tags": parse_tags_string(row["tags"]),
                        "description": row["desc"] or "",
                        "flags": row["flags"]
                    }
                }
            return {"success": True, "bookmarked": False, "bookmark": None}
    except Exception as e:
        log(f"Check URL error: {e}")
        return {"success": False, "error": str(e), "bookmarked": False}

def handle_add_bookmark(data: Dict[str, Any]) -> Dict[str, Any]:
    url = (data.get("url") or "").strip()
    title = (data.get("title") or "").strip()
    raw_tags = data.get("tags") or ""
    desc = (data.get("description") or "").strip()
    db_path = resolve_db_path(data.get("db_path"))
    buku_bin = resolve_buku_bin(data.get("buku_bin"))

    if not url:
        return {"success": False, "error": "URL is required"}

    # Format tags
    if isinstance(raw_tags, list):
        tags_list = [t.strip().lower() for t in raw_tags if t.strip()]
    else:
        tags_list = [t.strip().lower() for t in raw_tags.split(",") if t.strip()]
    tags_str = ",".join(tags_list)

    # 1. Try Buku CLI
    env = os.environ.copy()
    env["PYTHONWARNINGS"] = "ignore"
    cmd = [buku_bin, "--db", db_path, "--nostdin", "--tacit", "--np", "-a", url]
    if tags_str:
        cmd.append(tags_str)
    if desc:
        cmd.extend(["-c", desc])
    if title:
        cmd.extend(["--title", title])

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
        out = (proc.stdout + " " + proc.stderr).strip()
        log(f"Buku add result: code={proc.returncode}, out={out}")

        # Check if URL already exists
        if "already exists at index" in out:
            # Extract index
            import re
            m = re.search(r"already exists at index\s+(\d+)", out)
            index = m.group(1) if m else None
            if index and tags_str:
                # Append tags using buku -u <index> --tag + <tags>
                upd_cmd = [buku_bin, "--db", db_path, "--nostdin", "--tacit", "--np", "-u", index, "--tag", "+", tags_str]
                if desc:
                    upd_cmd.extend(["-c", desc])
                if title:
                    upd_cmd.extend(["--title", title])
                subprocess.run(upd_cmd, capture_output=True, text=True, env=env)
                return {
                    "success": True,
                    "action": "updated",
                    "id": int(index),
                    "message": f"URL already exists at index #{index}. Appended tag(s): {tags_str}"
                }
            elif index:
                return {
                    "success": True,
                    "action": "exists",
                    "id": int(index),
                    "message": f"URL already exists at index #{index}."
                }

        if proc.returncode == 0:
            return {
                "success": True,
                "action": "added",
                "message": f"Bookmark saved to Buku successfully! ({url})"
            }
        else:
            # Fallback to direct SQLite insertion if CLI failed
            return insert_or_update_sqlite(db_path, url, title, tags_list, desc)

    except Exception as e:
        log(f"Buku CLI failed, trying direct SQLite: {e}")
        return insert_or_update_sqlite(db_path, url, title, tags_list, desc)

def insert_or_update_sqlite(db_path: str, url: str, title: str, tags_list: List[str], desc: str) -> Dict[str, Any]:
    try:
        with get_db_connection(db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, metadata, tags, desc FROM bookmarks WHERE URL = ?", (url,))
            existing = cur.fetchone()
            if existing:
                curr_tags = parse_tags_string(existing["tags"])
                merged_tags = sorted(list(set(curr_tags + tags_list)))
                sql_tags = format_tags_for_sqlite(merged_tags)
                final_title = title or existing["metadata"]
                final_desc = desc or existing["desc"]
                cur.execute(
                    "UPDATE bookmarks SET tags = ?, metadata = ?, desc = ? WHERE id = ?",
                    (sql_tags, final_title, final_desc, existing["id"])
                )
                conn.commit()
                return {
                    "success": True,
                    "action": "updated",
                    "id": existing["id"],
                    "message": f"Updated bookmark #{existing['id']} with tags: {', '.join(merged_tags)}"
                }
            else:
                sql_tags = format_tags_for_sqlite(tags_list)
                cur.execute(
                    "INSERT INTO bookmarks (URL, metadata, tags, desc, flags) VALUES (?, ?, ?, ?, 0)",
                    (url, title or url, sql_tags, desc)
                )
                conn.commit()
                new_id = cur.lastrowid
                return {
                    "success": True,
                    "action": "added",
                    "id": new_id,
                    "message": f"Saved bookmark #{new_id} to Buku SQLite database."
                }
    except Exception as e:
        log(f"SQLite direct insert failed: {e}")
        return {"success": False, "error": str(e)}

def handle_add_batch(data: Dict[str, Any]) -> Dict[str, Any]:
    items = data.get("bookmarks") or []
    tag = (data.get("tag") or "general").strip().lower()
    db_path = resolve_db_path(data.get("db_path"))

    if not items:
        return {"success": False, "error": "No bookmarks provided"}

    results = []
    success_count = 0
    for item in items:
        url = item.get("url")
        title = item.get("title") or ""
        if not url:
            continue
        res = handle_add_bookmark({
            "url": url,
            "title": title,
            "tags": tag,
            "description": f"Batch saved tab from browser",
            "db_path": db_path
        })
        if res.get("success"):
            success_count += 1
        results.append(res)

    return {
        "success": True,
        "total": len(items),
        "saved": success_count,
        "tag": tag,
        "message": f"Saved {success_count}/{len(items)} tabs to group '{tag}'."
    }

def handle_delete_bookmark(data: Dict[str, Any]) -> Dict[str, Any]:
    item_id = data.get("id")
    if not item_id:
        return {"success": False, "error": "Bookmark ID is required"}

    db_path = resolve_db_path(data.get("db_path"))
    buku_bin = resolve_buku_bin(data.get("buku_bin"))

    # Try buku CLI first
    try:
        env = os.environ.copy()
        env["PYTHONWARNINGS"] = "ignore"
        cmd = [buku_bin, "--db", db_path, "--nostdin", "--tacit", "--np", "-d", str(item_id)]
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if proc.returncode == 0:
            return {"success": True, "id": item_id, "message": f"Bookmark #{item_id} deleted."}
    except Exception as e:
        log(f"Buku delete CLI error: {e}")

    # Fallback to direct SQLite deletion
    try:
        with get_db_connection(db_path) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM bookmarks WHERE id = ?", (item_id,))
            conn.commit()
            return {"success": True, "id": item_id, "message": f"Bookmark #{item_id} deleted from database."}
    except Exception as e:
        return {"success": False, "error": str(e)}

def handle_update_bookmark(data: Dict[str, Any]) -> Dict[str, Any]:
    item_id = data.get("id")
    if not item_id:
        return {"success": False, "error": "Bookmark ID is required"}

    title = data.get("title")
    raw_tags = data.get("tags")
    desc = data.get("description")
    db_path = resolve_db_path(data.get("db_path"))

    if isinstance(raw_tags, list):
        tags_list = [t.strip().lower() for t in raw_tags if t.strip()]
    elif isinstance(raw_tags, str):
        tags_list = [t.strip().lower() for t in raw_tags.split(",") if t.strip()]
    else:
        tags_list = None

    try:
        with get_db_connection(db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, metadata, tags, desc FROM bookmarks WHERE id = ?", (item_id,))
            row = cur.fetchone()
            if not row:
                return {"success": False, "error": f"Bookmark #{item_id} not found."}

            new_title = title if title is not None else row["metadata"]
            new_desc = desc if desc is not None else row["desc"]
            new_tags_sql = format_tags_for_sqlite(tags_list) if tags_list is not None else row["tags"]

            cur.execute(
                "UPDATE bookmarks SET metadata = ?, desc = ?, tags = ? WHERE id = ?",
                (new_title, new_desc, new_tags_sql, item_id)
            )
            conn.commit()
            return {
                "success": True,
                "id": item_id,
                "message": f"Bookmark #{item_id} updated successfully."
            }
    except Exception as e:
        return {"success": False, "error": str(e)}

def handle_open_in_emacs(data: Dict[str, Any]) -> Dict[str, Any]:
    action = data.get("action") or "search"
    emacsclient_bin = resolve_emacsclient(data.get("emacsclient_bin"))

    # Map actions to fzl-emacs Lisp expressions
    lisp_map = {
        "search": "(progn (select-frame-set-input-focus (selected-frame)) (desktoping-buku-search-and-open))",
        "manager": "(progn (select-frame-set-input-focus (selected-frame)) (desktoping-buku-open-manager))",
        "start_day": "(progn (select-frame-set-input-focus (selected-frame)) (desktoping-buku-open-start-day-urls-buffer))",
        "browse_tag": "(progn (select-frame-set-input-focus (selected-frame)) (desktoping-buku-browse-by-tag))",
        "tutorial": "(progn (select-frame-set-input-focus (selected-frame)) (desktoping-buku-open-tutorial))",
    }

    if action == "add_bookmark":
        url = (data.get("url") or "").replace('"', '\\"')
        title = (data.get("title") or "").replace('"', '\\"')
        tags = (data.get("tags") or "").replace('"', '\\"')
        desc = (data.get("description") or "").replace('"', '\\"')
        lisp_expr = f'(progn (select-frame-set-input-focus (selected-frame)) (desktoping-buku-add-bookmark "{url}" "{title}" "{tags}" "{desc}"))'
    else:
        lisp_expr = lisp_map.get(action, lisp_map["search"])

    try:
        proc = subprocess.run(
            [emacsclient_bin, "-e", lisp_expr],
            capture_output=True,
            text=True,
            timeout=3.0
        )
        if proc.returncode == 0:
            return {
                "success": True,
                "action": action,
                "output": proc.stdout.strip(),
                "message": f"Executed '{action}' in Emacs."
            }
        else:
            err = proc.stderr.strip() or proc.stdout.strip()
            return {
                "success": False,
                "error": f"Emacsclient error: {err}. (Is 'M-x server-start' running in Emacs?)"
            }
    except Exception as e:
        return {"success": False, "error": f"Failed to execute emacsclient: {e}"}

# -----------------------------------------------------------------------------
# Native Messaging stdio Loop
# -----------------------------------------------------------------------------

def read_message() -> Optional[Dict[str, Any]]:
    """Read a 32-bit length prefixed JSON message from stdin."""
    try:
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length or len(raw_length) < 4:
            return None
        length = struct.unpack("@I", raw_length)[0]
        if length == 0:
            return None
        message_bytes = sys.stdin.buffer.read(length)
        if len(message_bytes) < length:
            return None
        return json.loads(message_bytes.decode("utf-8"))
    except Exception as e:
        log(f"Read error: {e}")
        return None

def send_message(msg: Dict[str, Any]) -> None:
    """Send a 32-bit length prefixed JSON message to stdout."""
    try:
        encoded = json.dumps(msg, ensure_ascii=False).encode("utf-8")
        sys.stdout.buffer.write(struct.pack("@I", len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
    except Exception as e:
        log(f"Send error: {e}")

def dispatch_message(msg: Dict[str, Any]) -> Dict[str, Any]:
    action = msg.get("action")
    log(f"Dispatching action: {action}")
    if action == "ping" or action == "status":
        return handle_ping(msg)
    elif action == "get_bookmarks" or action == "search":
        return handle_get_bookmarks(msg)
    elif action == "get_tags":
        return handle_get_tags(msg)
    elif action == "check_url" or action == "is_bookmarked":
        return handle_check_url(msg)
    elif action == "add_bookmark" or action == "add":
        return handle_add_bookmark(msg)
    elif action == "add_batch":
        return handle_add_batch(msg)
    elif action == "delete_bookmark" or action == "delete":
        return handle_delete_bookmark(msg)
    elif action == "update_bookmark" or action == "update":
        return handle_update_bookmark(msg)
    elif action == "open_in_emacs" or action == "emacs":
        return handle_open_in_emacs(msg)
    else:
        return {"success": False, "error": f"Unknown action: {action}"}

def main():
    log("Native messaging host started.")
    try:
        while True:
            msg = read_message()
            if msg is None:
                log("EOF on stdin, exiting native host.")
                break
            response = dispatch_message(msg)
            send_message(response)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        log(f"Fatal error in main loop: {e}")
    finally:
        log("Native host exiting.")

if __name__ == "__main__":
    # If run with '--test' argument in terminal, perform self-test
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        print("Running native host self-test...")
        ping_res = handle_ping({})
        print("Ping result:", json.dumps(ping_res, indent=2))
        bm_res = handle_get_bookmarks({})
        print(f"Bookmarks found: {bm_res.get('count', 0)}")
        tags_res = handle_get_tags({})
        print(f"Tags found: {len(tags_res.get('tags', []))}")
        print("Self-test passed!")
        sys.exit(0)
    main()
