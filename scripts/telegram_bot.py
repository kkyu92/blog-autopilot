#!/usr/bin/env python3
"""
Telegram Bot for Claude Code remote control.
- Polls for messages from authorized chat ID only
- Forwards commands to Claude Code CLI
- Posts results back to Telegram
- Auto-creates GitHub Issues for each task
- Updates STATUS.md after completion
"""

from __future__ import annotations

import os
import sys
import json
import time
import subprocess
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Config ──────────────────────────────────────────────────
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8754613586:AAHB3wPHdAdyas6Y2PIn3g7mHW9vK-hbwCg")
CHAT_ID = int(os.environ.get("TELEGRAM_CHAT_ID", "8661161978"))
PROJECT_DIR = Path.home() / "projects" / "content-autopilot"
POLL_INTERVAL = 5  # seconds
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


# ── Telegram helpers ────────────────────────────────────────
def send_message(text: str, parse_mode: str = "Markdown") -> None:
    """Send a message to the authorized chat."""
    # Telegram max message length is 4096
    for i in range(0, len(text), 4000):
        chunk = text[i:i + 4000]
        try:
            requests.post(f"{API_BASE}/sendMessage", json={
                "chat_id": CHAT_ID,
                "text": chunk,
                "parse_mode": parse_mode,
            }, timeout=10)
        except Exception:
            # Retry without parse_mode if markdown fails
            requests.post(f"{API_BASE}/sendMessage", json={
                "chat_id": CHAT_ID,
                "text": chunk,
            }, timeout=10)


def get_updates(offset: int = 0) -> list:
    """Poll for new messages."""
    try:
        resp = requests.get(f"{API_BASE}/getUpdates", params={
            "offset": offset,
            "timeout": POLL_INTERVAL,
        }, timeout=POLL_INTERVAL + 5)
        data = resp.json()
        if data.get("ok"):
            return data.get("result", [])
    except Exception as e:
        print(f"[poll error] {e}")
    return []


# ── GitHub helpers ──────────────────────────────────────────
def create_github_issue(title: str, body: str) -> str | None:
    """Create a GitHub issue and return its number."""
    try:
        result = subprocess.run(
            ["gh", "issue", "create", "--title", title, "--body", body],
            capture_output=True, text=True, cwd=PROJECT_DIR, timeout=30,
        )
        if result.returncode == 0:
            # Output is the issue URL
            url = result.stdout.strip()
            return url
    except Exception as e:
        print(f"[gh issue error] {e}")
    return None


def close_github_issue(issue_url: str, comment: str) -> None:
    """Add comment and close a GitHub issue."""
    try:
        # Extract issue number from URL
        issue_num = issue_url.rstrip("/").split("/")[-1]
        subprocess.run(
            ["gh", "issue", "comment", issue_num, "--body", comment],
            capture_output=True, text=True, cwd=PROJECT_DIR, timeout=30,
        )
        subprocess.run(
            ["gh", "issue", "close", issue_num],
            capture_output=True, text=True, cwd=PROJECT_DIR, timeout=30,
        )
    except Exception as e:
        print(f"[gh close error] {e}")


# ── Claude Code execution ──────────────────────────────────
def run_claude(instruction: str) -> str:
    """Run Claude Code CLI with the given instruction."""
    cmd = [
        "claude", "--dangerously-skip-permissions",
        "-p", instruction,
        "--output-format", "text",
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True, text=True,
            cwd=PROJECT_DIR,
            timeout=600,  # 10 min max
        )
        output = result.stdout.strip()
        if result.returncode != 0 and result.stderr:
            output += f"\n\n[stderr]: {result.stderr.strip()}"
        return output if output else "(no output)"
    except subprocess.TimeoutExpired:
        return "[error] Claude Code timed out (10 min limit)"
    except FileNotFoundError:
        return "[error] claude CLI not found. Is Claude Code installed?"
    except Exception as e:
        return f"[error] {e}"


# ── Git helpers ─────────────────────────────────────────────
def git_push() -> str:
    """Commit any changes and push to GitHub."""
    try:
        subprocess.run(["git", "add", "-A"], cwd=PROJECT_DIR, timeout=10)
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=PROJECT_DIR, timeout=10,
        )
        if not result.stdout.strip():
            return "no changes to push"

        subprocess.run(
            ["git", "commit", "-m", f"bot: auto-commit {datetime.now().strftime('%Y-%m-%d %H:%M')}"],
            capture_output=True, text=True, cwd=PROJECT_DIR, timeout=30,
        )
        push = subprocess.run(
            ["git", "push", "origin", "main"],
            capture_output=True, text=True, cwd=PROJECT_DIR, timeout=30,
        )
        if push.returncode == 0:
            return "pushed to GitHub"
        return f"push failed: {push.stderr.strip()}"
    except Exception as e:
        return f"git error: {e}"


# ── Command handlers ────────────────────────────────────────
def handle_command(text: str) -> str:
    """Process a command and return the response."""
    text = text.strip()

    # Built-in commands
    if text.lower() == "/status":
        status_file = PROJECT_DIR / "STATUS.md"
        if status_file.exists():
            return status_file.read_text()
        return "STATUS.md not found"

    if text.lower() == "/ping":
        return "pong! Bot is alive."

    if text.lower() == "/help":
        return (
            "*Commands:*\n"
            "/status - Show STATUS.md\n"
            "/ping - Check bot health\n"
            "/push - Commit & push changes\n"
            "/help - This message\n\n"
            "Any other message = Claude Code instruction"
        )

    if text.lower() == "/push":
        return git_push()

    # Everything else goes to Claude Code
    return None  # Signal to run Claude


def process_message(text: str) -> None:
    """Full pipeline: GitHub Issue → Claude → Result → Close Issue → Notify."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Check for built-in command first
    builtin_result = handle_command(text)
    if builtin_result is not None:
        send_message(builtin_result)
        return

    # 1. Notify start
    send_message(f"*Task started*\n`{text[:100]}`")

    # 2. Create GitHub Issue
    issue_url = create_github_issue(
        title=f"[bot] {text[:60]}",
        body=f"**Source:** Telegram\n**Time:** {now}\n**Instruction:**\n{text}",
    )
    if issue_url:
        send_message(f"Issue created: {issue_url}")

    # 3. Run Claude Code
    result = run_claude(text)

    # 4. Git push if there are changes
    push_status = git_push()

    # 5. Close GitHub Issue with result
    if issue_url:
        close_github_issue(issue_url, f"## Result\n\n{result[:3000]}\n\n**Push:** {push_status}")

    # 6. Send result to Telegram
    response = f"*Done!*\n\n{result[:3500]}"
    if push_status != "no changes to push":
        response += f"\n\n*Git:* {push_status}"
    if issue_url:
        response += f"\n\n*Issue:* {issue_url}"

    send_message(response)


# ── Main loop ───────────────────────────────────────────────
def main():
    print(f"[bot] Starting telegram bot for chat_id={CHAT_ID}")
    print(f"[bot] Project: {PROJECT_DIR}")
    print(f"[bot] Poll interval: {POLL_INTERVAL}s")

    # Send startup message
    send_message("Bot started! Send /help for commands.")

    offset = 0
    while True:
        updates = get_updates(offset)
        for update in updates:
            offset = update["update_id"] + 1
            msg = update.get("message", {})

            # Security: only accept from authorized chat
            if msg.get("chat", {}).get("id") != CHAT_ID:
                print(f"[bot] Rejected message from chat_id={msg.get('chat', {}).get('id')}")
                continue

            text = msg.get("text", "").strip()
            if not text:
                continue

            print(f"[bot] Received: {text[:80]}")
            try:
                process_message(text)
            except Exception as e:
                error_msg = f"[error] {e}"
                print(error_msg)
                send_message(error_msg)

        time.sleep(1)


if __name__ == "__main__":
    main()
