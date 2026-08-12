#!/usr/bin/env bash
# 공개 문서에 내부 추적 번호가 남았는지 검사한다.
#
# 이유는 CLAUDE.md "공개 문서(README · 공개 SKILL) — 내부 참조 번호 제외" 가 소유한다.
# 요약하면 사용자는 ADR 맥락을 모르고, 이 문서를 그대로 에이전트에 붙여 쓰기도 한다.
#
# 사용법: bash scripts/check-public-refs.sh   (cwd 는 저장소 루트)
# 위반을 stdout 으로 출력하고 종료 코드 1, 깨끗하면 0.
set -uo pipefail

TARGETS=(README.md skills/)

hits=$(grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" "${TARGETS[@]}" 2>/dev/null)

if [ -n "$hits" ]; then
  printf '[위반] 공개 문서에 내부 추적 번호가 있다 — 번호를 빼고 문장을 다시 쓴다\n'
  printf '%s\n' "$hits"
  exit 1
fi

echo "공개 문서 내부 참조 검사 통과"
