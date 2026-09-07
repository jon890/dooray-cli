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
gh issue list --state open --json number,title --jq '.[] | "#\(.number)  \(.title)"'
git log ${LAST_TAG}..HEAD --grep="#[0-9]" --oneline
```

열린 이슈마다 이번 릴리스가 그것을 해결했는지 판단한다.
이슈가 요청한 것과 이번의 신규 명령·옵션을 짝지어 본다.
후속 작업이 남은 이슈는 닫지 않는다.

close 대상 목록을 사용자에게 제시해 확정받는다.
그 목록이 7단계의 Release 노트 하단과 10단계의 자동 close 에 쓰인다.

### 3. 문서 동기화 검증

2단계에서 뽑은 신규 명령과 옵션이 사용자 문서에 있는지 본다.

```bash
# cwd: <repo root>
# 2단계의 각 문자열을 하나씩 넣는다. 플레이스홀더를 그대로 넣으면 0건이 나와 통과로 오독된다.
grep -rn '<명령이나 옵션 문자열>' README.md skills/
```

0건이면 누락이다. 누락 항목과 넣을 위치를 사용자에게 보고하고 보완 커밋을 따로 만든 뒤 다음 단계로 간다.

새 명령이 없으면 이 단계를 통과로 본다. 그 사실을 사용자에게 밝힌다.

### 4. 개인 식별 정보 / 사내 식별자 노출 검증 (필수, 실패 시 중단)

```bash
# cwd: <repo root>
node scripts/check-pii.mjs
node scripts/check-public-refs.mjs
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

**전달 방식은 `--notes-file {path}` 만 쓴다.** 인라인 `--notes "..."` 와 quoted heredoc 은 쓰지 않는다.

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

**자가 점검.** release create 나 edit 직후에 확인한다.

```bash
gh release view v{version} --json body -q .body | tr -cd '\\' | wc -c
# 기대: 0 (backslash 잔재 없음)
```

0 이 아니면 `--notes-file` 로 즉시 `gh release edit v{version} --notes-file {path}` 재발행.

릴리스 노트 본문 마지막에 close 대상 이슈를 적는다. 10단계에서 이 목록을 그대로 쓴다.

```markdown
Closes

이번 릴리스로 해결된 이슈 (release publish 후 자동 close):
- #{번호} {이슈 제목}
```

`--generate-notes` 는 쓰지 않는다. 2단계에서 판단한 Closes 목록과 신규 명령·옵션 분류가 빠진다.

### 8. npm Publish

npm publish는 2FA OTP가 필요하므로 사용자에게 직접 실행을 요청한다:

```
npm publish --access public --otp={code}
```

사용자에게 위 명령을 안내하고, 완료 후 결과를 확인한다.

### 9. 최종 확인

```bash
# cwd: <repo root>
gh release view "v{version}" --json tagName,isDraft -q '"\(.tagName) draft=\(.isDraft)"'
npm view @bifos/dooray-cli version
```

첫 명령이 그 태그를 내고 `draft=false` 여야 한다.
둘째가 방금 올린 버전을 내야 한다. npm 색인 반영에 수 분 걸리므로 값이 다르면 잠시 후 다시 조회한다.

### 10. 해결된 이슈 close

2단계에서 식별한 close 대상 이슈를 일괄 close. release publish 완료 후에만 실행 (publish 실패 시 close 금지).

```bash
RELEASE_URL="https://github.com/jon890/dooray-cli/releases/tag/v{version}"
for n in {이슈번호 목록}; do
  gh issue close $n --comment "v{version}에서 구현 완료되어 close합니다. ${RELEASE_URL}"
done
```

각 close 에 release 링크를 코멘트로 붙인다. 이슈에서 release 노트로 바로 이동할 수 있다.

**close 금지 케이스**:

- 후속 작업이 남은 이슈 (예: MVP만 구현되고 추가 옵션 후속)
- 이슈 본문 범위와 구현 범위가 부분적으로만 일치
→ 이런 케이스는 close 대신 **comment**로 진행 상황만 기록하고 이슈 open 유지
