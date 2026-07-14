#!/usr/bin/env python3
"""
Agent harness — Claude Code phase 순차 실행기.

Usage:
  python .claude/skills/plan-and-build/run-phases.py <task-dir> [--from-phase N]

  예: python .claude/skills/plan-and-build/run-phases.py tasks/implement-api-client
      python .claude/skills/plan-and-build/run-phases.py tasks/implement-api-client --from-phase 3

Exit codes:
  0  — 모든 phase 완료
  1  — phase 실행 오류 (index.json의 error_message 참고)
  2  — 사용자 개입 필요 (index.json의 blocked_reason 참고)
"""

import json
import os
import selectors
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


# ── .env 로드 ────────────────────────────────────────────────────────────────

def load_dotenv() -> None:
    """프로젝트 루트의 .env 파일을 읽어 환경변수로 설정. 이미 설정된 변수는 덮어쓰지 않음."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key not in os.environ:
                os.environ[key] = value


load_dotenv()


# ── 웹훅 알림 ──────────────────────────────────────────────────────────────────

def notify(message: str) -> None:
    """DOORAY_WEBHOOK_URL 환경변수가 있을 때만 전송. 없으면 조용히 스킵."""
    webhook_url = os.environ.get("DOORAY_WEBHOOK_URL")
    if not webhook_url:
        return
    payload = json.dumps({"botName": "dooray-cli", "text": message}).encode()
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[warn] 웹훅 알림 실패: {e}", file=sys.stderr)


# ── Task 파일 헬퍼 ────────────────────────────────────────────────────────────

def validate_task(task: dict, task_dir: Path) -> None:
    """index.json 필수 필드 검증."""
    errors: list[str] = []

    required_task_fields = [
        "name", "description", "created_at", "updated_at",
        "status", "current_phase", "total_phases",
        "error_message", "blocked_reason", "phases",
    ]
    for field in required_task_fields:
        if field not in task:
            errors.append(f"task 필수 필드 누락: '{field}'")

    if "phases" in task:
        phases = task["phases"]
        if not isinstance(phases, list) or len(phases) == 0:
            errors.append("phases는 1개 이상의 배열이어야 합니다")
        else:
            if task.get("total_phases") != len(phases):
                errors.append(
                    f"total_phases({task.get('total_phases')}) != "
                    f"phases 배열 길이({len(phases)})"
                )

            required_phase_fields = [
                "number", "title", "file", "status", "allowedTools",
            ]
            for i, phase in enumerate(phases):
                for field in required_phase_fields:
                    if field not in phase:
                        errors.append(
                            f"phase[{i}] 필수 필드 누락: '{field}'"
                        )

                expected_num = i + 1
                if phase.get("number") != expected_num:
                    errors.append(
                        f"phase[{i}].number={phase.get('number')}, "
                        f"expected={expected_num}"
                    )

                phase_file = task_dir / phase.get("file", "")
                if phase.get("file") and not phase_file.exists():
                    errors.append(f"phase 파일 없음: {phase_file}")

    if errors:
        print("\n❌ index.json 검증 실패:\n", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print(
            "\n  → .claude/planning-overlay.md (index.json 스키마) 참고\n",
            file=sys.stderr,
        )
        sys.exit(1)


def load_task(task_dir: Path) -> tuple[dict, Path]:
    index_path = task_dir / "index.json"
    if not index_path.exists():
        print(f"[error] index.json not found: {index_path}", file=sys.stderr)
        sys.exit(1)
    with open(index_path, encoding="utf-8") as f:
        task = json.load(f)
    validate_task(task, task_dir)
    return task, index_path


def save_task(task: dict, index_path: Path) -> None:
    task["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(task, f, indent=2, ensure_ascii=False)


# ── Phase 실행 ────────────────────────────────────────────────────────────────

DEFAULT_TOOLS = "Read,Write,Edit,Bash,Glob,Grep"
DEFAULT_PHASE_TIMEOUT = 600  # 기본 10분 (초)
BLOCKED_MARKER = "PHASE_BLOCKED:"
FAILED_MARKER = "PHASE_FAILED:"


def run_phase(
    phase_file: Path,
    allowed_tools: list[str],
    model: str | None = None,
    timeout: int = DEFAULT_PHASE_TIMEOUT,
) -> tuple[int, str, str]:
    """
    phase 프롬프트를 Claude에 전달하고 (returncode, stdout, stderr) 반환.
    stdout을 실시간 스트리밍하면서 동시에 캡처한다.
    timeout초 이내에 완료되지 않으면 프로세스를 kill하고 에러 반환.
    """
    with open(phase_file, encoding="utf-8") as f:
        prompt = f.read()

    tools = ",".join(allowed_tools) if allowed_tools else DEFAULT_TOOLS

    cmd = ["claude", "--print", "--allowedTools", tools]
    if model:
        cmd.extend(["--model", model])

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    proc.stdin.write(prompt)
    proc.stdin.close()

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []
    deadline = time.monotonic() + timeout

    sel = selectors.DefaultSelector()
    sel.register(proc.stdout, selectors.EVENT_READ)

    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                proc.kill()
                proc.wait()
                return -1, "".join(stdout_lines), f"PHASE_FAILED: 타임아웃 ({timeout}초) 초과"

            events = sel.select(timeout=min(remaining, 5.0))
            if events:
                line = proc.stdout.readline()
                if not line:
                    break  # EOF
                print(line, end="", flush=True)
                stdout_lines.append(line)
            else:
                if proc.poll() is not None:
                    break  # 프로세스 종료됨
    finally:
        sel.unregister(proc.stdout)
        sel.close()

    proc.wait()
    stderr_output = proc.stderr.read()
    if stderr_output:
        print(stderr_output, end="", file=sys.stderr)
        stderr_lines.append(stderr_output)

    return proc.returncode, "".join(stdout_lines), "".join(stderr_lines)


def find_marker(text: str, marker: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(marker):
            return stripped[len(marker):].strip()
    return None


def fmt_elapsed(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m}m{s:02d}s" if m else f"{s}s"


# ── 메인 ─────────────────────────────────────────────────────────────────────

def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__, file=sys.stderr)
        sys.exit(1)

    task_dir = Path(args[0]).resolve()
    if not task_dir.is_dir():
        print(f"[error] task 디렉터리 없음: {task_dir}", file=sys.stderr)
        sys.exit(1)

    from_phase = 1
    if "--from-phase" in args:
        idx = args.index("--from-phase")
        try:
            from_phase = int(args[idx + 1])
        except (IndexError, ValueError):
            print("[error] --from-phase 뒤에 정수를 지정하세요", file=sys.stderr)
            sys.exit(1)

    task, index_path = load_task(task_dir)
    task_name = task["name"]
    phases = task["phases"]
    total = len(phases)

    print(f"\n🚀  Task: {task_name}  ({total} phases)\n")

    for phase in phases:
        phase_num = phase["number"]
        phase_title = phase.get("title", f"Phase {phase_num}")

        if phase_num < from_phase:
            print(f"  ⏭  Phase {phase_num}/{total}: {phase_title}  (skipped)")
            continue

        if phase["status"] == "completed":
            print(f"  ✓  Phase {phase_num}/{total}: {phase_title}  (already completed)")
            continue

        phase_file = task_dir / phase["file"]
        if not phase_file.exists():
            msg = f"phase 파일 없음: {phase_file}"
            phase["status"] = "failed"
            task["status"] = "failed"
            task["error_message"] = msg
            save_task(task, index_path)
            notify(f"❌ Task **{task_name}** phase {phase_num} 실패: {msg}")
            print(f"  ✗  {msg}", file=sys.stderr)
            sys.exit(1)

        allowed_tools = phase.get("allowedTools", [])
        model = phase.get("model")
        timeout = phase.get("timeout", DEFAULT_PHASE_TIMEOUT)

        model_label = f" [{model}]" if model else ""
        timeout_label = f" (timeout: {timeout}s)" if timeout != DEFAULT_PHASE_TIMEOUT else ""
        print(f"  ▶  Phase {phase_num}/{total}: {phase_title}{model_label}{timeout_label}")
        print(f"  {'─' * 60}")

        phase["status"] = "running"
        task["status"] = "running"
        task["current_phase"] = phase_num
        save_task(task, index_path)
        notify(f"▶️ Task **{task_name}** phase {phase_num}/{total} 시작: {phase_title}{model_label}")

        start_time = time.monotonic()
        returncode, stdout, stderr = run_phase(phase_file, allowed_tools, model, timeout)
        elapsed = time.monotonic() - start_time

        print(f"  {'─' * 60}")

        blocked = find_marker(stdout, BLOCKED_MARKER) or find_marker(stderr, BLOCKED_MARKER)
        if blocked:
            phase["status"] = "blocked"
            task["status"] = "blocked"
            task["blocked_reason"] = blocked
            save_task(task, index_path)
            msg = f"⚠️ Task **{task_name}** phase {phase_num} blocked: {blocked}"
            print(f"\n  ⚠  {msg}", file=sys.stderr)
            notify(msg)
            sys.exit(2)

        if returncode != 0:
            error = (
                find_marker(stdout, FAILED_MARKER)
                or find_marker(stderr, FAILED_MARKER)
                or stderr.strip()
                or f"exit code {returncode}"
            )
            phase["status"] = "failed"
            task["status"] = "failed"
            task["error_message"] = error
            save_task(task, index_path)
            msg = f"❌ Task **{task_name}** phase {phase_num} 실패: {error}"
            print(f"\n  ✗  {msg}", file=sys.stderr)
            notify(msg)
            sys.exit(1)

        phase["status"] = "completed"
        # 최신 커밋 SHA 기록
        try:
            sha_result = subprocess.run(
                ["git", "log", "-1", "--format=%H"],
                cwd=index_path.parent.parent,
                capture_output=True, text=True,
            )
            if sha_result.returncode == 0:
                phase["commitSha"] = sha_result.stdout.strip()[:12]
        except Exception:
            pass
        save_task(task, index_path)
        notify(f"✅ Task **{task_name}** phase {phase_num}/{total} 완료: {phase_title} [{fmt_elapsed(elapsed)}]")
        print(f"  ✓  Phase {phase_num}/{total}: {phase_title}  완료  [{fmt_elapsed(elapsed)}]\n")

    task["status"] = "completed"
    save_task(task, index_path)
    msg = f"✅ Task **{task_name}** 완료 ({total} phases)"
    print(f"\n{msg}\n")
    notify(msg)
    sys.exit(0)


if __name__ == "__main__":
    main()
