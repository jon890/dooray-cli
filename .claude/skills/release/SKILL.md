---
name: release
description: dooray-cli 의 새 버전을 npm 에 내보낸다. "/release", "릴리스", "버전 범프", "npm publish", "새 버전 배포" 요청에 사용한다.
---

# release

**목표: 검증을 통과한 커밋을 npm 에 내보내고, 릴리스 내용이 기록됐으며 확정한 이슈가 닫혔다.**

- 검증에 실패하면 게시하지 않는다.
- 태그가 가리키는 버전과 `package.json` 이 같아야 한다.
- 사용자에게 노출되는 새 명령과 옵션은 공개 문서에 있어야 한다.
- 게시가 끝나기 전에 이슈를 닫지 않는다.

## 워크플로 개요

| 단계 | 이름 | 통과 조건 | reference |
| --- | --- | --- | --- |
| 시작 전 | main 최신화 | `main` 으로 옮겨 origin 최신 커밋 위에 로컬 커밋을 올렸다 | |
| 1 | 변경 분석 | 직전 태그 이후 커밋을 분류했고 close 대상 이슈를 사용자가 확정했다 | |
| 2 | 문서 동기화 | `doc-sync-check.mjs` 가 종료 코드 0 으로 끝났다 | |
| 3 | 버전 올리기 | `main` 에서 `package.json` 의 `version` 을 올렸다 | |
| 4 | 검증 | `preflight.mjs` 가 종료 코드 0 으로 끝났다 | |
| 5 | 태그와 Release | 태그를 밀었고 Release 를 만들었다 | |
| 6 | 게시 | npm 에 새 버전이 올라갔다 | `references/publish.md` |
| 7 | 마감 | `verify-release.mjs` 가 종료 코드 0 으로 끝났고 close 대상 이슈가 닫혔다 | |

2단계와 4단계의 실패는 그 절의 복구를 따른다.
태그를 민 뒤인 5~7단계에서 실패하면 멈추고 사용자에게 보고한다.

명령 블록은 저장소 root 에서 붙여넣는다. 스크립트는 그 뒤 root 를 스스로 확인한다.
실행 규약은 `CLAUDE.md` 의 "저장소 스킬 작성 규약" 이 소유한다.

## 워크플로 상세

### 시작 전. main 최신화

`main` 이 아닌 곳에서 분석과 문서 보완을 시작하면 커밋이 릴리스 밖에 남을 수 있다.

```bash
git switch main
git fetch origin
git rebase origin/main
```

`pull --ff-only` 를 쓰지 않는 이유는 릴리스 직전에 로컬 미push 커밋이 남아 있을 수 있어서다.
`rebase` 는 그 커밋을 origin 최신 커밋 위로 옮긴다.

### 1. 변경 분석

```bash
LAST_TAG="$(git describe --tags --abbrev=0)"
git log "$LAST_TAG"..HEAD --no-merges --pretty='%s' | sort
```

넷으로 분류한다.

- 사용자에게 노출되는 **새 명령과 서브커맨드**
- 기존 명령에 붙은 **새 옵션**
- **버그 수정**
- **문서와 내부 작업**. 릴리스 노트에서는 사용자에게 보이는 것만 남긴다

close 대상 이슈를 짝지어 확정받는다.

```bash
gh issue list --state open --json number,title --jq '.[] | "#\(.number)  \(.title)"'
```

열린 이슈마다 이번 릴리스가 그 요청을 채웠는지 본다. 후속 작업이 남은 이슈와
범위가 부분만 겹치는 이슈는 닫지 않고 진행 상황만 댓글로 남긴다.
확정한 목록이 5단계의 릴리스 노트와 7단계의 close 에 그대로 쓰인다.

### 2. 문서 동기화

인자 없이 실행한다. 무엇을 검사할지는 검사기가 정한다.

```bash
node .claude/skills/release/scripts/doc-sync-check.mjs
```

종료 코드 1 이면 누락이다. 누락 항목과 넣을 위치를 보고하고 보완 커밋을 따로 만든 뒤 다음으로 간다.

### 3. 버전 올리기

**`package.json` 의 `version` 필드만 바꾼다.** `src/index.ts` 는 손대지 않는다.
CLI 버전은 빌드 시 `package.json` 에서 주입되고, 4단계가 둘이 같은지 확인한다.

문서와 스킬에 적힌 다른 버전 숫자는 특정 기능의 최소 버전 하한이다.
그 기능이 바뀌지 않았으면 그대로 둔다.

### 4. 검증

```bash
node .claude/skills/release/scripts/preflight.mjs
```

검사 목록은 그 스크립트가 소유한다.
CI release 워크플로의 태그-버전 일치와 pre-release 거부는 게시 단계에서 따로 검사한다.
실패한 것을 마지막에 나열한다.

개인 식별 정보 검사가 걸리면 `CLAUDE.md` 의 대체 표를 따라 교체하고 보완 커밋을 만든 뒤 다시 돌린다.
사용자가 명시로 동의하지 않는 한 릴리스를 막는다.

통과하면 커밋하고 push 한다. 버전 올리기와 다른 관심사를 한 커밋에 담지 않는다.

```bash
VERSION="" # package.json 에 넣은 버전에서 v를 뺀 값을 넣는다.
: "${VERSION:?VERSION을 넣는다}"
[ "$(git branch --show-current)" = "main" ] || { echo "STOP: main 이 아니다"; exit 1; }
git add package.json
git commit -m "chore(release): $VERSION 으로 버전을 올린다"
git push origin main
```

### 5. 태그와 Release

```bash
VERSION="" # package.json 에 넣은 버전에서 v를 뺀 값을 넣는다.
: "${VERSION:?VERSION을 넣는다}"
git tag -a "v$VERSION" -m "v$VERSION"
git push origin "v$VERSION"
```

기존 태그를 force-update 하지 않는다. 새 태그만 만든다.

릴리스 노트는 1단계 분류를 그대로 쓴다. 사용자가 읽는 글이므로 저장소 관용구와
내부 참조 번호를 넣지 않는다. 본문 마지막에 close 대상 이슈를 적는다.

**본문은 파일로 쓰고 `--notes-file` 로 넘긴다.** 인라인 `--notes` 와 heredoc 은 쓰지 않는다.
7단계가 본문의 escape 잔재를 확인한다.

```bash
VERSION="" # package.json 에 넣은 버전에서 v를 뺀 값을 넣는다.
NOTES="" # 작성하고 검사한 릴리스 노트 파일 경로를 넣는다.
: "${VERSION:?VERSION을 넣는다}" "${NOTES:?NOTES를 넣는다}"
~/.claude/skills/korean-check/scripts/check.sh "$NOTES"
gh release create "v$VERSION" --title "v$VERSION" --notes-file "$NOTES" --verify-tag
```

`--verify-tag` 는 태그가 올라가지 않은 상태에서 릴리스가 만들어지는 것을 막는다.
`--generate-notes` 는 쓰지 않는다. 1단계의 분류와 close 목록이 빠진다.

### 6. 게시

**`references/publish.md` 를 읽고 따른다.** 경로가 CI 와 로컬 둘이고,
저장소 변수 `NPM_TRUSTED_PUBLISHING` 이 어느 쪽인지 정한다.
그 문서가 두 경로와 Trusted Publishing 등록 상태를 소유한다.

### 7. 마감

```bash
VERSION="" # package.json 에 넣은 버전에서 v를 뺀 값을 넣는다.
: "${VERSION:?VERSION을 넣는다}"
node .claude/skills/release/scripts/verify-release.mjs "$VERSION"
```

npm 색인 반영만 실패하면 잠시 후 같은 명령을 다시 실행한다.

**종료 코드 0 을 받은 뒤에만** 1단계에서 확정한 이슈를 닫는다.

```bash
VERSION="" # package.json 에 넣은 버전에서 v를 뺀 값을 넣는다.
ISSUES=(12 34) # 1단계에서 확정한 이슈 번호로 바꾼다.
: "${VERSION:?VERSION을 넣는다}"
RELEASE_URL="https://github.com/jon890/dooray-cli/releases/tag/v$VERSION"
for n in "${ISSUES[@]}"; do
  gh issue close "$n" --comment "v$VERSION 에서 구현이 끝나 닫는다. ${RELEASE_URL}"
done
```
