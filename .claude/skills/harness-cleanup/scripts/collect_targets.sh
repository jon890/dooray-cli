#!/usr/bin/env bash
#
# 하네스 지침 파일의 줄수를 모아 규모를 보여준다.
# Usage: bash collect_targets.sh [repo-root]
#
set -u
cd "${1:-.}" || exit 1

total=0
found=0

show() {
  [ -f "$1" ] || return 0
  n=$(wc -l < "$1" | tr -d ' ')
  printf "  %-52s %5s\n" "$1" "$n"
  total=$((total + n))
  found=$((found + 1))
}

echo "프로젝트 지침"
show CLAUDE.md

echo "custom agent"
for f in .claude/agents/*.md; do show "$f"; done

echo "내부 스킬"
for f in .claude/skills/*/SKILL.md; do show "$f"; done

echo "오버레이"
for f in .claude/*-overlay.md; do show "$f"; done

echo "공개 스킬"
for f in skills/*/SKILL.md skills/*/references/*.md; do show "$f"; done

echo
printf "  %-52s %5s (%s개 파일)\n" "합계" "$total" "$found"

[ "$found" -eq 0 ] && { echo "대상 파일을 찾지 못했다 — repo root 에서 실행하는지 확인하라" >&2; exit 2; }
exit 0
