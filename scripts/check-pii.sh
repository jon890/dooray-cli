#!/usr/bin/env bash
# 개인 식별 정보와 사내 식별자가 git 추적 파일에 들어갔는지 검사한다.
#
# 정책과 대체 표기는 CLAUDE.md "개인 식별 정보 / 사내 식별자 노출 금지" 가 소유한다.
# 이 스크립트는 그 정책의 실행 경로다 — 화이트리스트는 여기가 단일 소스다.
#
# 사용법: bash scripts/check-pii.sh   (cwd 는 저장소 루트)
# 위반을 stdout 으로 출력하고 종료 코드 1, 깨끗하면 0.
#
# shebang 으로 bash 를 고정한다. zsh 는 배열을 다르게 확장해
# 검사 대상이 조용히 첫 원소 하나로 줄어든 적이 있다.
set -uo pipefail

SCAN=(README.md skills/ docs/ CLAUDE.md .claude/ .github/ scripts/ tasks/ src/)

# 공개 도메인. 이 목록 밖의 도메인은 사내 도메인일 수 있다고 본다.
OK_DOMAINS="dooray\.com|gov-dooray\.com|dooray\.co\.kr|gov-dooray\.co\.kr"
OK_DOMAINS="$OK_DOMAINS|helpdesk\.dooray\.com|github\.com|npmjs\.com|example\.com"
OK_DOMAINS="$OK_DOMAINS|youtube\.com|anthropic\.com|claude\.com|x\.com"

# 문서에 써도 되는 dummy ID 와 공개 helpdesk 페이지 ID.
OK_IDS="1234567890123456789|9876543210987654321|2939987647631384419"
OK_IDS="$OK_IDS|1111222233334444555|2222333344445555666|3333444455556666777"
OK_IDS="$OK_IDS|4444555566667777888|9999888877776666555|9999999999999999999"
OK_IDS="$OK_IDS|1111111111111111111|2222222222222222222|123456789012345"

# CLI 예시의 project 자리에 와도 되는 값.
# 앞 셋은 가상 예시이고, 뒤 셋은 명령 패턴이 잘못 잡아내는 단어다.
# `<project>` 같은 placeholder 는 아래 정규식이 `<` 로 시작하는 값을 보지 않아 애초에 안 잡힌다.
OK_PROJECTS="my-project testproj NONEXIST body https meta"

failed=0

report() {
  failed=1
  printf '\n[위반] %s\n' "$1"
  shift
  printf '%s\n' "$@"
}

# 1) 공개 화이트리스트 밖의 URL·이메일 도메인
#    https:// 또는 @ 접두를 요구해 코드의 property 접근(.com/.net)을 배제한다.
#
#    화이트리스트는 호스트 경계에 앵커한다. 앵커가 없으면 `dooray.com` 이
#    `evil-dooray.com` 안에서도 매치되어 typosquat 이 그대로 통과한다.
domains=$(grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" "${SCAN[@]}" 2>/dev/null \
  | grep -vE "(https?://|@|\.)($OK_DOMAINS)\$")
[ -n "$domains" ] && report "화이트리스트 밖 도메인 — placeholder 로 바꾸거나 이 스크립트의 OK_DOMAINS 를 검토한다" "$domains"

# 2) 15자리 이상 numeric — 실제 Dooray ID 일 수 있다
#
#    `-o` 로 매치 단위로 뽑는다. 줄 단위로 거르면 허용 ID 와 실제 ID 가
#    한 줄에 같이 있을 때 그 줄 전체가 걸러져 실제 ID 가 빠져나간다.
ids=$(grep -rnoE "[0-9]{15,}" "${SCAN[@]}" 2>/dev/null \
  | grep -vE ":($OK_IDS)\$")
[ -n "$ids" ] && report "허용 목록 밖의 긴 숫자 — 실제 ID 인지 확인하고 placeholder 나 dummy 로 바꾼다" "$ids"

# 3) CLI 예시의 project 인자
#    프로젝트 코드는 임의 문자열이라 패턴으로 못 거른다. 허용 목록 밖이면 사람이 확인한다
projects=$(grep -rohE "(post (create|list|get|search)|project (list|members|groups|tags|templates|workflows)|wiki (pages|tree)) [A-Za-z][A-Za-z0-9_-]{2,}" "${SCAN[@]}" 2>/dev/null \
  | awk '{print $NF}' | sort -u)
unknown=""
for p in $projects; do
  case " $OK_PROJECTS " in
    *" $p "*) ;;
    *) unknown="$unknown$p"$'\n' ;;
  esac
done
[ -n "$unknown" ] && report "예시에 쓰인 낯선 project 값 — 사내 코드면 placeholder 로 바꾸고, 가상 예시면 이 스크립트의 OK_PROJECTS 에 추가한다" "$unknown"

if [ "$failed" -eq 0 ]; then
  echo "개인 식별 정보 검사 통과"
fi
exit "$failed"
