---
name: release
description: dooray-cli 새 버전 릴리스 자동화 — 빌드 검증, 버전 범프, git tag, GitHub Release, npm publish, 해결된 이슈 자동 close 순으로 진행. "/release", "릴리스", "버전 범프", "npm publish", "새 버전 배포" 같은 요청 시 반드시 이 스킬 사용.
---
# release

dooray-cli의 새 버전을 릴리스한다.

## 릴리스 절차

아래 단계를 **순서대로** 실행한다. 각 단계 실패 시 즉시 중단하고 사용자에게 보고한다.

### 1. 사전 검증

```bash
# 작업 디렉토리가 clean한지 확인
git status --porcelain

# 빌드 성공 확인
pnpm run build
```

- uncommitted 변경이 있으면 먼저 커밋 여부를 사용자에게 확인
- 빌드 실패 시 중단

### 2. 이전 버전 대비 변경사항 분석

이전 태그 이후 커밋을 모아 사용자에게 변경 요약을 제시한다.

```bash
# 직전 태그 식별
LAST_TAG=$(git describe --tags --abbrev=0)

# 커밋 목록
git log --oneline ${LAST_TAG}..HEAD

# 분류용 (feat/fix/refactor/docs/chore)
git log ${LAST_TAG}..HEAD --pretty=format:"%s" | sort
```

다음을 도출:

- **신규 명령** (`feat(commands)` 등) — 사용자에게 노출되는 새 명령/서브커맨드
- **신규 옵션** (`feat(...)` 메시지에 `--xxx` 등장) — 기존 명령에 추가된 플래그
- **버그 수정** / **리팩토링** / **문서/인프라**

추가로 **해결된 GitHub 이슈**를 식별:

```bash
# 열린 이슈 목록
gh issue list --state open --json number,title --jq '.[] | "#\(.number)  \(.title)"'

# task 디렉토리 / 커밋 메시지 / PR 본문에서 "Issue #N" 또는 "#N" 참조 추출
grep -rE "Issue #[0-9]+|^#[0-9]+" tasks/ 2>/dev/null
git log ${LAST_TAG}..HEAD --grep="#[0-9]" --oneline
```

각 열린 이슈에 대해 "이번 릴리스로 해결되었는가?" 판단:

- 이슈 제목/본문 ↔ 이번 릴리스의 신규 명령/옵션 매핑
- 후속 이슈(`feat(... ) follow-up`)는 release 시점에 close하지 않음 — 별도 task가 필요

**결과를 사용자에게 제시**하고 close 대상 이슈 목록을 확정. 이 목록은:

- GitHub Release 노트 하단에 `Closes #N, #M` 으로 기록
- 10단계에서 release publish 후 자동 close

이 결과는 다음 단계(문서 동기화 검증)와 GitHub Release 노트에 그대로 활용한다.

### 3. 문서 동기화 검증 (README + dooray-cli 스킬)

신규 명령이나 옵션이 있으면 사용자 문서에 반영됐는지 확인한다.

2단계에서 도출한 명령·옵션 문자열 **하나씩** `grep -rn '<그 문자열>' README.md skills/` 로 조회한다.
히트가 0이면 누락이다. 플레이스홀더를 그대로 정규식에 넣으면 0건이 나와 통과로 오독된다.


| 위치                              | 무엇을 확인                               |
| ------------------------------- | ------------------------------------ |
| `README.md`                     | "사용법" 섹션에 등장하는지. 새 명령은 알맞은 카테고리에 넣는다 |
| `skills/dooray-cli/SKILL.md`    | 의도별 커맨드 표와 공통 규칙에 반영됐는지              |
| `skills/dooray-cli/references/` | 해당 명령군 reference 에 동작과 함정이 들어갔는지     |


**누락 발견 시**:

- 사용자에게 누락 항목을 보고하고, 어느 위치에 어떤 문장으로 추가할지 제안
- 보완 commit을 별도로 작성한 후 다음 단계 진행 (`docs(readme): document {feature}` 또는 `docs(skill): add {feature} to dooray-cli SKILL.md`)
- 보완을 건너뛰면 사용자가 명시적으로 동의했을 때만 (예: "이번 릴리스는 인프라만, 기능 추가 없음")

**버그 수정/리팩토링만 있는 릴리스**라면 본 단계는 통과 가능 — 사용자에게 그 사실을 명시하고 진행.

### 4. 개인 식별 정보 / 사내 식별자 노출 검증 (필수, 실패 시 중단)

```bash
# cwd: <repo root>
bash scripts/check-pii.sh
bash scripts/check-public-refs.sh
```

패턴과 화이트리스트는 두 스크립트가 소유한다. 본 skill 은 실행 시점과 후속 처리만 정의한다.

**종료 코드가 0 이 아니면**:

- 사용자에게 즉시 보고하고 위치를 노출
- `CLAUDE.md` 의 placeholder 표(`<project>` / `<tenant>` / `<postId>` 등)를 따라 교체하고 보완 commit
- 보완 commit 후 다시 실행해 통과를 확인하고 다음 단계로 간다
- **사용자가 "내부 사용 OK" 로 명시 동의하지 않는 한 release 차단**

### 5. 버전 범프

**사전 가드 (필수)**: 현재 branch 가 `main` 인지 확인. PR branch 에서 bump 하면 commit 이 다른 branch 에 박혀 main 에 반영되지 않고 tag 가 엉뚱한 commit 가리킴.

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "main" ]; then
  echo "⚠  현재 branch: $CURRENT — main 으로 switch"
  git switch main
fi
# main 이어도 항상 origin 과 동기화 — 다른 세션이 PR 을 머지해 로컬이 stale 이면
# bump→push 가 non-fast-forward 로 거부된다 (v0.12.0 release 시 3회 발생).
# fetch + rebase 로 로컬 미push 커밋이 있어도 안전하게 최신 위로 올린다.
git fetch origin
git rebase origin/main
```

**Why fetch+rebase (단순 `pull --ff-only` 아님)**: release 직전엔 로컬에 미push 커밋(직전 작업)이 남아 있을 수 있다. `pull --ff-only` 는 그 경우 실패하지만 `fetch + rebase` 는 로컬 커밋을 origin 최신 위로 재배치해 통과시킨다.

버전 변경:

- `package.json`의 `version` 필드를 `{version}`으로 변경
- `src/index.ts`는 직접 수정하지 않는다. CLI 버전은 빌드 시 `package.json.version`에서 주입된다.
- 변경 후 다시 `pnpm run build`와 `pnpm verify:package`로 빌드 산출물 버전 일치를 검증

### 6. 커밋 & 푸시

```bash
# 커밋 직전 branch 재확인 (위 가드와 중복이지만 자기 방어)
[ "$(git branch --show-current)" = "main" ] || { echo "STOP: not on main"; exit 1; }

git add package.json
git commit -m "chore: bump version to v{version}"
git push origin main
```

bump 커밋이 다른 branch 에 들어갔으면 main 으로 옮긴 뒤 진행한다.

### 7. Git Tag & GitHub Release

```bash
git tag -a v{version} -m "v{version}"
git push origin v{version}
```

기존 태그를 force-update 하지 않는다. 새 태그만 만든다.

릴리스 노트는 **2단계 분석 결과를 그대로 활용**해 작성한다 (Highlights / 신규 명령 / 신규 옵션 / 버그 수정 / **Closes** / Full Changelog 링크).

**전달 방식: `--notes-file {path}` 필수** — 인라인 `--notes "..."` 또는 quoted heredoc 금지.

```bash
# 1. 임시 파일에 본문 작성 (Write 도구 / cat / EDITOR 어느 쪽이든 OK)
#    → /tmp/release-v{version}-notes.md

# 2. 파일 경로로 전달
gh release create v{version} --title "v{version} — {요약}" --notes-file /tmp/release-v{version}-notes.md
```

**Why** (글로벌 `~/.claude/rules/markdown-readability.md` "렌더링 함정" 표):

- quoted heredoc 안에서는 backtick 과 달러 기호, backslash 가 이미 비활성화되므로 escape 가 필요 없다
- 그런데 "안전하게" backslash 를 덧붙이면 그것이 본문에 리터럴로 남아 markdown 이 깨진다
  - v0.10.0 릴리스에서 backtick 66개가 escape 된 형태로 출력되는 사고가 있었다
- `--notes-file` 은 파일 경로만 넘기므로 shell quoting 과 escape 함정을 아예 피한다

**자가 점검** — release create / edit 직후:

```bash
gh release view v{version} --json body -q .body | tr -cd '\\' | wc -c
# 기대: 0 (backslash 잔재 없음)
```

0 이 아니면 `--notes-file` 로 즉시 `gh release edit v{version} --notes-file {path}` 재발행.

릴리스 노트 본문 마지막에 close 대상 이슈를 적는다. 10단계에서 이 목록을 그대로 쓴다.

```markdown
## Closes

이번 릴리스로 해결된 이슈 (release publish 후 자동 close):
- #{번호} {이슈 제목}
```

`--generate-notes` 는 쓰지 않는다 — 2단계에서 판단한 Closes 목록과 신규 명령·옵션 분류가 빠진다.

### 8. npm Publish

npm publish는 2FA OTP가 필요하므로 사용자에게 직접 실행을 요청한다:

```
npm publish --access public --otp={code}
```

사용자에게 위 명령을 안내하고, 완료 후 결과를 확인한다.

### 9. 최종 확인

- `https://github.com/jon890/dooray-cli/releases/tag/v{version}` 릴리스 확인
- `https://www.npmjs.com/package/@bifos/dooray-cli` 버전 확인 (반영에 수 분 소요)

### 10. 해결된 이슈 close

2단계에서 식별한 close 대상 이슈를 일괄 close. release publish 완료 후에만 실행 (publish 실패 시 close 금지).

```bash
RELEASE_URL="https://github.com/jon890/dooray-cli/releases/tag/v{version}"
for n in {이슈번호 목록}; do
  gh issue close $n --comment "v{version}에서 구현 완료되어 close합니다. ${RELEASE_URL}"
done
```

각 close에 release 링크 코멘트 첨부 — 이슈에서 release notes로 즉시 이동 가능.

**close 금지 케이스**:

- 후속 작업이 남은 이슈 (예: MVP만 구현되고 추가 옵션 후속)
- 이슈 본문 범위와 구현 범위가 부분적으로만 일치
→ 이런 케이스는 close 대신 **comment**로 진행 상황만 기록하고 이슈 open 유지
