#!/usr/bin/env bash
#
# dooray-cli benchmark
#   cold: 캐시 없이 전체 API 호출 커맨드 측정
#   warm: 캐시 프라이밍 후 캐시만으로 응답 가능한 커맨드만 측정
#
# Usage: ./scripts/benchmark.sh <project> <post-number> [wiki-page-id]
# Env:   BENCHMARK_PROJECT / BENCHMARK_POST_NUMBER  (인자 대신 사용 가능)
#        BENCHMARK_THRESHOLD=3      (cold, default)
#        BENCHMARK_THRESHOLD_WARM=0.2  (warm, default)
#
set -u

CLI="node $(dirname "$0")/../dist/index.js"
PROJECT="${1:-${BENCHMARK_PROJECT:-}}"
POST_NUMBER="${2:-${BENCHMARK_POST_NUMBER:-}}"
WIKI_PAGE_ID="${3:-}"

if [ -z "$PROJECT" ] || [ -z "$POST_NUMBER" ]; then
  echo "Usage: ./scripts/benchmark.sh <project> <post-number> [wiki-page-id]" >&2
  echo "       (또는 BENCHMARK_PROJECT / BENCHMARK_POST_NUMBER 환경 변수)" >&2
  exit 1
fi
THRESHOLD_COLD="${BENCHMARK_THRESHOLD:-3}"
THRESHOLD_WARM="${BENCHMARK_THRESHOLD_WARM:-0.2}"
CACHE_DIR="$HOME/.dooray/cache"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

pass=0
fail=0
total=0
results=()

run_bench() {
  local label="$1"
  local threshold="$2"
  shift 2
  local cmd="$*"

  local start end elapsed
  start=$(python3 -c "import time; print(time.time())")
  local exit_code=0
  eval "$cmd" > /dev/null 2>&1 || exit_code=$?
  end=$(python3 -c "import time; print(time.time())")
  elapsed=$(python3 -c "print(f'{$end - $start:.3f}')")

  total=$((total + 1))

  local ok
  ok=$(python3 -c "print('1' if $elapsed <= $threshold else '0')")

  local status
  if [[ $exit_code -ne 0 ]]; then
    status="${RED}ERROR${RESET}"
    fail=$((fail + 1))
  elif [[ "$ok" == "1" ]]; then
    status="${GREEN}PASS${RESET}"
    pass=$((pass + 1))
  else
    status="${RED}FAIL${RESET}"
    fail=$((fail + 1))
  fi

  results+=("$(printf "  %-45s %8ss  %b" "$label" "$elapsed" "$status")")
}

echo ""
echo -e "${BOLD}dooray-cli benchmark${RESET}"
echo -e "project: ${YELLOW}${PROJECT}${RESET}  cold: ${CYAN}${THRESHOLD_COLD}s${RESET}  warm: ${CYAN}${THRESHOLD_WARM}s${RESET}"
echo "─────────────────────────────────────────────────────────────────"

# ─── Cold: 캐시 없이 전체 API 호출 ────────────────────────
rm -rf "$CACHE_DIR"
run_bench "[cold] config get" "$THRESHOLD_COLD" "$CLI config get"

rm -rf "$CACHE_DIR"
run_bench "[cold] doctor" "$THRESHOLD_COLD" "$CLI doctor"

rm -rf "$CACHE_DIR"
run_bench "[cold] project list" "$THRESHOLD_COLD" "$CLI project list --quiet"

rm -rf "$CACHE_DIR"
run_bench "[cold] project members" "$THRESHOLD_COLD" "$CLI project members $PROJECT --quiet"

rm -rf "$CACHE_DIR"
run_bench "[cold] project workflows" "$THRESHOLD_COLD" "$CLI project workflows $PROJECT --quiet"

rm -rf "$CACHE_DIR"
run_bench "[cold] post list" "$THRESHOLD_COLD" "$CLI post list $PROJECT --quiet"

rm -rf "$CACHE_DIR"
run_bench "[cold] post get" "$THRESHOLD_COLD" "$CLI post get $PROJECT $POST_NUMBER --json"

rm -rf "$CACHE_DIR"
run_bench "[cold] post comment list" "$THRESHOLD_COLD" "$CLI post comment list $PROJECT $POST_NUMBER --quiet"

rm -rf "$CACHE_DIR"
run_bench "[cold] wiki list" "$THRESHOLD_COLD" "$CLI wiki list --quiet"

rm -rf "$CACHE_DIR"
run_bench "[cold] wiki pages" "$THRESHOLD_COLD" "$CLI wiki pages $PROJECT --quiet"

if [[ -n "$WIKI_PAGE_ID" ]]; then
  rm -rf "$CACHE_DIR"
  run_bench "[cold] wiki page get" "$THRESHOLD_COLD" "$CLI wiki page get $PROJECT $WIKI_PAGE_ID --json"
fi

# ─── Warm: 캐시 프라이밍 후 캐시 전용 커맨드 ──────────────
# Prime all caches
rm -rf "$CACHE_DIR"
eval "$CLI project list --quiet" > /dev/null 2>&1
eval "$CLI project members $PROJECT --quiet" > /dev/null 2>&1
eval "$CLI project workflows $PROJECT --quiet" > /dev/null 2>&1

results+=("  ---")

run_bench "[warm] config get" "$THRESHOLD_WARM" "$CLI config get"
run_bench "[warm] cache clear --dry" "$THRESHOLD_WARM" "$CLI config get"
run_bench "[warm] project list" "$THRESHOLD_WARM" "$CLI project list --quiet"
run_bench "[warm] project list --search" "$THRESHOLD_WARM" "$CLI project list --search $PROJECT"
run_bench "[warm] project members" "$THRESHOLD_WARM" "$CLI project members $PROJECT --quiet"
run_bench "[warm] project workflows" "$THRESHOLD_WARM" "$CLI project workflows $PROJECT --quiet"

# ─── Results ──────────────────────────────────────────────
echo ""
echo -e "${BOLD}Results:${RESET}"
for r in "${results[@]}"; do
  echo -e "$r"
done

echo ""
echo "─────────────────────────────────────────────────────────────────"
echo -e "Total: $total  ${GREEN}Pass: $pass${RESET}  ${RED}Fail: $fail${RESET}"

rm -rf "$CACHE_DIR"

if [[ $fail -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}BENCHMARK FAILED${RESET} — $fail command(s) exceeded threshold"
  exit 1
else
  echo -e "\n${GREEN}${BOLD}ALL PASSED${RESET}"
  exit 0
fi
