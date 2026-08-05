#!/usr/bin/env bash
#
# 문서에 적힌 bash 코드 블록을 그대로 추출해 bash 와 zsh 양쪽에서 돌린다.
# 문서대로 실행했을 때 실제로 동작하는지 확인하는 것이 목적이다.
#
# Usage: bash run_doc_snippets.sh <파일> "<블록 앞에 오는 머리말>"
#   예:  bash run_doc_snippets.sh CLAUDE.md "검증 grep"
#
# 셸마다 결과가 다르면 배열 확장 같은 셸 차이를 의심한다.
# 결과가 0건이면 음성 대조까지 해야 한다 — 검사를 안 해서 0건일 수 있다.
#
set -u

FILE="${1:?사용법: run_doc_snippets.sh <파일> \"<머리말>\"}"
MARKER="${2:?블록을 찾을 머리말을 지정하라}"

[ -f "$FILE" ] || { echo "파일이 없다: $FILE" >&2; exit 2; }

SNIPPET=$(mktemp)
trap 'rm -f "$SNIPPET"' EXIT

python3 - "$FILE" "$MARKER" > "$SNIPPET" <<'PY'
import re, sys, pathlib
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
marker = re.escape(sys.argv[2])
m = re.search(marker + r".*?```(?:bash|sh)\n(.*?)```", text, re.S)
if not m:
    sys.stderr.write(f'"{sys.argv[2]}" 뒤에서 bash 블록을 찾지 못했다\n')
    sys.exit(3)
sys.stdout.write(m.group(1))
PY
[ $? -eq 0 ] || exit 3

echo "추출한 블록 ($(wc -l < "$SNIPPET" | tr -d ' ')줄)"
echo "─────────────────────────────────────"

for sh in bash zsh; do
  command -v "$sh" >/dev/null || { echo "[$sh] 설치돼 있지 않아 건너뛴다"; continue; }

  if ! "$sh" -n "$SNIPPET" 2>/tmp/syntax-err; then
    echo "[$sh] 문법 오류"
    sed 's/^/    /' /tmp/syntax-err
    continue
  fi

  out=$("$sh" "$SNIPPET" 2>&1)
  n=$(printf '%s' "$out" | grep -c . || true)
  echo "[$sh] 문법 OK / 출력 ${n}줄"
  [ -n "$out" ] && printf '%s\n' "$out" | head -10 | sed 's/^/    /'
done

echo "─────────────────────────────────────"
echo "출력이 0줄이면 음성 대조를 하라 — 검사 대상 경로에 탐지 대상을 심고"
echo "같은 블록이 그것을 잡아내는지 확인한다. 잡지 못하면 검사가 도는 것이 아니다."
