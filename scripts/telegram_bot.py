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
import threading
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# ── Config ──────────────────────────────────────────────────
PROJECT_DIR = Path.home() / "projects" / "content-autopilot"
load_dotenv(PROJECT_DIR / ".env")

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHAT_ID = int(os.environ["TELEGRAM_CHAT_ID"])
POLL_INTERVAL = 5  # seconds
HEARTBEAT_INTERVAL = 3600  # 1 hour
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"
LOOP_RUNNING = False  # Guard against concurrent loops


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
def run_claude(instruction: str, timeout_sec: int = 600) -> str:
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
            timeout=timeout_sec,
        )
        output = result.stdout.strip()
        if result.returncode != 0 and result.stderr:
            output += f"\n\n[stderr]: {result.stderr.strip()}"
        return output if output else "(no output)"
    except subprocess.TimeoutExpired:
        return f"[error] Claude Code timed out ({timeout_sec // 60} min limit)"
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

    if text.lower() == "/health":
        uptime = datetime.now() - BOT_START_TIME
        hours = int(uptime.total_seconds() // 3600)
        mins = int((uptime.total_seconds() % 3600) // 60)
        return (
            f"*Bot Health*\n"
            f"Status: ✅ Running\n"
            f"Uptime: {hours}h {mins}m\n"
            f"Tasks processed: {TASK_COUNT}\n"
            f"Heartbeat: every {HEARTBEAT_INTERVAL // 60}min"
        )

    if text.lower() == "/help":
        return (
            "*Commands:*\n"
            "/status - Show STATUS.md\n"
            "/ping - Check bot health\n"
            "/health - Detailed health info\n"
            "/push - Commit & push changes\n"
            "/autoplan - Run full plan review (CEO+Design+Eng, ~30min)\n"
            "/loop N instruction - Run Claude in loop (max N iterations)\n"
            "/stop - Stop running loop/autoplan\n"
            "/help - This message\n\n"
            "Any other message = Claude Code instruction"
        )

    if text.lower() == "/push":
        return git_push()

    if text.lower() == "/stop":
        global LOOP_RUNNING
        if LOOP_RUNNING:
            LOOP_RUNNING = False
            return "Loop stop requested. Will stop after current iteration."
        return "No loop is running."

    if text.lower().startswith("/autoplan"):
        return "AUTOPLAN_CMD"

    if text.lower().startswith("/loop"):
        return "LOOP_CMD"  # Signal to run loop

    # Everything else goes to Claude Code
    return None  # Signal to run Claude


AUTOPLAN_TIMEOUT = 1800  # 30 min — autoplan is a long-running operation

AUTOPLAN_PROMPT = """You are running an automated plan review pipeline.

STEP 1: Read the autoplan skill file:
  Read the file at ~/.claude/skills/gstack/autoplan/SKILL.md

STEP 2: Read the current plan:
  Read PLAN.md in the project root.

STEP 3: Follow the autoplan skill instructions at FULL DEPTH.
  - Execute all phases sequentially: CEO Review → Design Review → Eng Review
  - Auto-decide all intermediate questions using the 6 Decision Principles from the skill
  - Produce ALL required outputs (diagrams, tables, registries, artifacts)
  - Write all changes directly to PLAN.md
  - For AskUserQuestion calls: auto-decide using the 6 principles (completeness, boil lakes, pragmatic, DRY, explicit over clever, bias toward action)
  - For premise confirmation gates: accept reasonable premises, challenge only clearly wrong ones
  - Skip the Preamble bash scripts and Telemetry sections (not applicable in headless mode)

STEP 4: After all phases complete, write a summary of what was reviewed and changed.

IMPORTANT:
- This is running in headless mode. Do NOT use AskUserQuestion — auto-decide everything.
- Do NOT use the Skill tool — read and follow the skill file instructions directly.
- Write ALL outputs to PLAN.md.
- Be thorough. This is the full review pipeline, not a summary.
"""


def run_autoplan() -> None:
    """Run the full autoplan review pipeline via Claude Code."""
    global LOOP_RUNNING
    LOOP_RUNNING = True

    send_message(
        "*Autoplan started*\n"
        "Running full CEO → Design → Eng review pipeline.\n"
        f"Timeout: {AUTOPLAN_TIMEOUT // 60} min"
    )

    issue_url = create_github_issue(
        title="[bot/autoplan] Full plan review pipeline",
        body=(
            f"**Source:** Telegram\n"
            f"**Time:** {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
            f"**Type:** autoplan (CEO → Design → Eng review)\n"
            f"**Timeout:** {AUTOPLAN_TIMEOUT // 60} min"
        ),
    )
    if issue_url:
        send_message(f"Issue: {issue_url}")

    result = run_claude(AUTOPLAN_PROMPT, timeout_sec=AUTOPLAN_TIMEOUT)

    push_status = git_push()

    if issue_url:
        close_github_issue(issue_url, f"## Autoplan Result\n\n{result[:3000]}\n\n**Push:** {push_status}")

    send_message(
        f"*Autoplan complete!*\n\n"
        f"{result[:3500]}\n\n"
        f"*Git:* {push_status}"
    )
    if issue_url:
        send_message(f"*Issue:* {issue_url}")

    LOOP_RUNNING = False


def parse_loop_command(text: str) -> tuple[int, str]:
    """Parse '/loop N instruction' format. Returns (max_iterations, instruction)."""
    parts = text.strip().split(None, 2)  # ['/loop', 'N', 'instruction...']
    if len(parts) < 3:
        return 0, ""
    try:
        max_iter = int(parts[1])
        max_iter = min(max(max_iter, 1), 10)  # Clamp 1-10
        return max_iter, parts[2]
    except ValueError:
        # No number given: '/loop instruction...' → default 3 iterations
        return 3, text.split(None, 1)[1]


def evaluate_result(instruction: str, result: str) -> tuple[bool, str]:
    """Ask Claude to evaluate if the result is satisfactory."""
    eval_prompt = (
        f"You are evaluating whether a task has been completed satisfactorily.\n\n"
        f"Original instruction: {instruction}\n\n"
        f"Result:\n{result[:3000]}\n\n"
        f"Evaluate this result. Respond in this exact JSON format:\n"
        f'{{"done": true/false, "reason": "brief explanation in Korean", '
        f'"next_action": "if not done, what to improve next (in Korean)"}}'
    )
    eval_output = run_claude(eval_prompt)

    try:
        # Extract JSON from response
        import re
        json_match = re.search(r'\{[^}]+\}', eval_output)
        if json_match:
            data = json.loads(json_match.group())
            return data.get("done", False), data.get("reason", ""), data.get("next_action", "")
    except (json.JSONDecodeError, AttributeError):
        pass

    return False, "evaluation failed", instruction


def run_loop(max_iterations: int, instruction: str) -> None:
    """Run Claude in a loop with evaluation between iterations."""
    global LOOP_RUNNING
    LOOP_RUNNING = True

    send_message(
        f"*Loop started*\n"
        f"Instruction: `{instruction[:100]}`\n"
        f"Max iterations: {max_iterations}"
    )

    issue_url = create_github_issue(
        title=f"[bot/loop] {instruction[:50]}",
        body=(
            f"**Source:** Telegram (loop)\n"
            f"**Max iterations:** {max_iterations}\n"
            f"**Instruction:**\n{instruction}"
        ),
    )
    if issue_url:
        send_message(f"Issue: {issue_url}")

    current_instruction = instruction
    all_results = []

    for i in range(1, max_iterations + 1):
        if not LOOP_RUNNING:
            send_message(f"*Loop stopped by user at iteration {i}*")
            break

        send_message(f"*[{i}/{max_iterations}]* Running...")

        result = run_claude(current_instruction)
        all_results.append(f"## Iteration {i}\n{result[:1000]}")

        # Push after each iteration
        push_status = git_push()

        # Last iteration → skip evaluation, just finish
        if i == max_iterations:
            send_message(
                f"*[{i}/{max_iterations}]* Max iterations reached.\n\n"
                f"{result[:2000]}\n\n"
                f"*Git:* {push_status}"
            )
            break

        # Evaluate
        done, reason, next_action = evaluate_result(instruction, result)

        if done:
            send_message(
                f"*[{i}/{max_iterations}] Done!*\n"
                f"Reason: {reason}\n\n"
                f"{result[:2000]}\n\n"
                f"*Git:* {push_status}"
            )
            break
        else:
            send_message(
                f"*[{i}/{max_iterations}]* Not yet satisfied.\n"
                f"Reason: {reason}\n"
                f"Next: {next_action}"
            )
            # Feed the improvement direction to next iteration
            current_instruction = (
                f"Previous instruction: {instruction}\n\n"
                f"Previous result feedback: {reason}\n"
                f"Improvement needed: {next_action}\n\n"
                f"Please improve based on the above feedback."
            )

    # Close issue
    if issue_url:
        summary = "\n\n".join(all_results)[:3000]
        close_github_issue(issue_url, f"## Loop completed ({i} iterations)\n\n{summary}")

    LOOP_RUNNING = False
    send_message("*Loop finished.*")


def process_message(text: str) -> None:
    """Full pipeline: GitHub Issue → Claude → Result → Close Issue → Notify."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Check for built-in command first
    builtin_result = handle_command(text)
    if builtin_result == "AUTOPLAN_CMD":
        if LOOP_RUNNING:
            send_message("A task is already running. Send `/stop` first.")
            return
        run_autoplan()
        return
    if builtin_result == "LOOP_CMD":
        max_iter, instruction = parse_loop_command(text)
        if not instruction:
            send_message("Usage: `/loop [N] instruction`\nN = max iterations (default 3, max 10)")
            return
        if LOOP_RUNNING:
            send_message("A loop is already running. Send `/stop` first.")
            return
        run_loop(max_iter, instruction)
        return
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


# ── Heartbeat ──────────────────────────────────────────────
def heartbeat_loop():
    """Send periodic heartbeat to confirm bot is alive."""
    while True:
        time.sleep(HEARTBEAT_INTERVAL)
        try:
            uptime = datetime.now() - BOT_START_TIME
            hours = int(uptime.total_seconds() // 3600)
            mins = int((uptime.total_seconds() % 3600) // 60)
            send_message(
                f"💓 *Heartbeat*\n"
                f"Uptime: {hours}h {mins}m\n"
                f"Tasks processed: {TASK_COUNT}",
            )
        except Exception as e:
            print(f"[heartbeat error] {e}")


BOT_START_TIME = datetime.now()
TASK_COUNT = 0


# ── Error notification ─────────────────────────────────────
def notify_error(context: str, error: Exception) -> None:
    """Send error alert to Telegram."""
    send_message(
        f"⚠️ *Error*\n"
        f"Context: `{context}`\n"
        f"Error: `{str(error)[:500]}`",
    )


# ── Main loop ───────────────────────────────────────────────
def main():
    global TASK_COUNT, BOT_START_TIME
    BOT_START_TIME = datetime.now()

    print(f"[bot] Starting telegram bot for chat_id={CHAT_ID}")
    print(f"[bot] Project: {PROJECT_DIR}")
    print(f"[bot] Poll interval: {POLL_INTERVAL}s")
    print(f"[bot] Heartbeat interval: {HEARTBEAT_INTERVAL}s")

    # Start heartbeat thread
    hb = threading.Thread(target=heartbeat_loop, daemon=True)
    hb.start()

    # Send startup message
    send_message(
        "🤖 *Bot started!*\n"
        f"Heartbeat: every {HEARTBEAT_INTERVAL // 60}min\n"
        "Send /help for commands.",
    )

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
                TASK_COUNT += 1
            except Exception as e:
                error_msg = f"[error] {e}"
                print(error_msg)
                notify_error(text[:80], e)

        time.sleep(1)


if __name__ == "__main__":
    main()
