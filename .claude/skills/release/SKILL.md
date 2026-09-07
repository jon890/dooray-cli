---
name: release
description: dooray-cli 의 새 버전을 npm 에 내보낸다. "/release", "릴리스", "버전 범프", "npm publish", "새 버전 배포" 요청에 사용한다.
---

# release

**목표: 검증을 통과한 커밋에 버전을 붙여 npm 에 내보내고, 그 릴리스가 무엇을 담았는지 사용자가 읽을 수 있게 남긴다.**

- 검증에 실패하면 게시하지 않는다.
- 태그가 가리키는 버전과 `package.json` 이 같아야 한다.
- 사용자에게 노출되는 새 명령과 옵션은 공개 문서에 있어야 한다.
- 게시가 끝나기 전에 이슈를 닫지 않는다.

## 워크플로 개요

| 단계 | 이름 | 통과 조건 |
| --- | --- | --- |
| 1 | 변경 분석 | 직전 태그 이후 커밋을 분류했고 close 대상 이슈를 사용자가 확정했다 |
| 2 | 문서 동기화 | `doc-sync-check.mjs` 가 종료 코드 0 으로 끝났다 |
| 3 | 버전 올리기 | `main` 에서 `package.json` 의 `version` 을 올렸다 |
| 4 | 검증 | `preflight.mjs` 가 종료 코드 0 으로 끝났다 |
| 5 | 태그와 Release | 태그를 밀었고 Release 를 만들었다 |
| 6 | 게시 | npm 에 새 버전이 올라갔다 |
| 7 | 마감 | `verify-release.mjs` 가 종료 코드 0 으로 끝났고 close 대상 이슈가 닫혔다 |

단계마다 실패하면 즉시 멈추고 사용자에게 보고한다.

스크립트는 모두 `<repo root>` 에서 돌린다. 스스로 저장소 root 를 찾아 이동하고,
각 검사의 종료 코드를 그 자리에서 읽는다. 출력을 `tail` 이나 `head` 로 잇지 않는다.
셸 파이프 뒤의 `$?` 는 마지막 명령의 것이라 검사 실패가 0 으로 보인다.

## 워크플로 상세

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

1단계에서 뽑은 명령과 옵션 문자열을 그대로 인자로 넘긴다.

```bash
node .claude/skills/release/scripts/doc-sync-check.mjs "wiki page move" --search --no-children
```

`README.md` 와 `skills/` 의 문서를 읽어 고정 문자열로 찾고 발견 위치를 낸다.
종료 코드 1 이면 누락이다. 누락 항목과 넣을 위치를 보고하고 보완 커밋을 따로 만든 뒤 다음으로 간다.

새 명령과 옵션이 없으면 이 단계를 통과로 보고, 그 사실을 사용자에게 밝힌다.

### 3. 버전 올리기

`main` 이 아닌 곳에서 올리면 커밋이 다른 브랜치에 남고 태그가 엉뚱한 커밋을 가리킨다.

```bash
git switch main
git fetch origin
git rebase origin/main
```

`pull --ff-only` 를 쓰지 않는 이유는 릴리스 직전에 로컬 미push 커밋이 남아 있을 수 있어서다.
`rebase` 는 그것을 origin 최신 위로 올린다.

**`package.json` 의 `version` 필드만 바꾼다.** `src/index.ts` 는 손대지 않는다.
CLI 버전은 빌드 시 `package.json` 에서 주입되고, 4단계가 둘이 같은지 확인한다.

문서와 스킬에 적힌 다른 버전 숫자는 특정 기능의 최소 버전 하한이다.
그 기능이 바뀌지 않았으면 그대로 둔다.

### 4. 검증

```bash
node .claude/skills/release/scripts/preflight.mjs
```

개인 식별 정보 검사, 공개 문서 내부 참조 검사, 타입 검사, 테스트, 빌드,
패키지 산출물 검증, 버전 일치를 순서대로 돌리고 실패한 것을 마지막에 나열한다.
CI 의 release 워크플로와 같은 집합이다.

**종료 코드가 0 이 아니면 게시하지 않는다.**
개인 식별 정보 검사가 걸리면 `CLAUDE.md` 의 대체 표를 따라 교체하고 보완 커밋을 만든 뒤 다시 돌린다.
사용자가 명시로 동의하지 않는 한 릴리스를 막는다.

통과하면 커밋하고 push 한다. 버전 올리기와 다른 관심사를 한 커밋에 담지 않는다.

```bash
[ "$(git branch --show-current)" = "main" ] || { echo "STOP: main 이 아니다"; exit 1; }
git add package.json
git commit -m "chore(release): <version> 으로 버전을 올린다"
git push origin main
```

### 5. 태그와 Release

```bash
git tag -a "v<version>" -m "v<version>"
git push origin "v<version>"
```

기존 태그를 force-update 하지 않는다. 새 태그만 만든다.

릴리스 노트는 1단계 분류를 그대로 쓴다. 사용자가 읽는 글이므로 저장소 관용구와
내부 참조 번호를 넣지 않는다. 본문 마지막에 close 대상 이슈를 적는다.

**본문은 파일로 쓰고 `--notes-file` 로 넘긴다.** 인라인 `--notes` 와 heredoc 은 쓰지 않는다.
7단계가 본문의 escape 잔재를 확인한다.

```bash
~/.claude/skills/korean-check/scripts/check.sh <노트 파일>
gh release create "v<version>" --title "v<version>" --notes-file <노트 파일> --verify-tag
```

`--verify-tag` 는 태그가 올라가지 않은 상태에서 릴리스가 만들어지는 것을 막는다.
`--generate-notes` 는 쓰지 않는다. 1단계의 분류와 close 목록이 빠진다.

### 6. 게시

**`references/publish.md` 를 읽고 따른다.** 경로가 CI 와 로컬 둘이고,
저장소 변수 `NPM_TRUSTED_PUBLISHING` 이 어느 쪽인지 정한다.
그 문서가 두 경로와 Trusted Publishing 등록 상태를 소유한다.

### 7. 마감

```bash
node .claude/skills/release/scripts/verify-release.mjs <version>
```

로컬과 origin 의 태그, Release 의 draft 상태, 본문의 escape 잔재,
npm 이 내는 최신 버전 넷을 확인한다. npm 색인 반영에 수 분 걸리므로
마지막 항목만 실패하면 잠시 후 다시 돌린다.

**종료 코드 0 을 받은 뒤에만** 1단계에서 확정한 이슈를 닫는다.

```bash
RELEASE_URL="https://github.com/jon890/dooray-cli/releases/tag/v<version>"
for n in <이슈 번호 목록>; do
  gh issue close "$n" --comment "v<version> 에서 구현이 끝나 닫는다. ${RELEASE_URL}"
done
```
