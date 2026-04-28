---
name: release
description: dooray-cli 릴리스 자동화. 빌드 검증 → 버전 범프 → git tag → GitHub Release → npm publish 순서로 진행.
---

# /release — dooray-cli Release

dooray-cli의 새 버전을 릴리스한다.

## 사용법

```
/release <version> [--notes "릴리스 노트"]
```

- `<version>`: semver 버전 (예: `0.4.0`, `0.3.2`)
- `--notes`: 릴리스 노트 (생략 시 git log에서 자동 생성)

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

이 결과는 다음 단계(문서 동기화 검증)와 GitHub Release 노트에 그대로 활용한다.

### 3. 문서 동기화 검증 (README + dooray-cli 스킬)

위에서 식별된 **신규 명령/옵션이 있다면**, 다음 두 위치에 반영되었는지 확인한다.

```bash
# 신규 명령/옵션 키워드를 README.md / skills/dooray-cli/SKILL.md에서 grep
grep -nE "<신규 옵션|신규 명령>" README.md
grep -nE "<신규 옵션|신규 명령>" skills/dooray-cli/SKILL.md
```

**검증 기준**:

| 위치 | 무엇을 확인 |
|---|---|
| `README.md` | "사용법" 섹션에 신규 명령/옵션이 등장. 새 명령은 적절한 카테고리(### 업무, ### 멤버 등)에 추가 |
| `skills/dooray-cli/SKILL.md` | AI 에이전트가 사용하는 외부 스킬. 신규 명령/옵션이 명령 카탈로그에 반영되어야 함 |

**누락 발견 시**:
- 사용자에게 누락 항목을 보고하고, 어느 위치에 어떤 문장으로 추가할지 제안
- 보완 commit을 별도로 작성한 후 다음 단계 진행 (`docs(readme): document <feature>` 또는 `docs(skill): add <feature> to dooray-cli SKILL.md`)
- 보완을 건너뛰면 사용자가 명시적으로 동의했을 때만 (예: "이번 릴리스는 인프라만, 기능 추가 없음")

**버그 수정/리팩토링만 있는 릴리스**라면 본 단계는 통과 가능 — 사용자에게 그 사실을 명시하고 진행.

### 4. 버전 범프

- `package.json`의 `version` 필드를 `<version>`으로 변경
- `src/index.ts`의 `.version("x.y.z")`를 `<version>`으로 변경
- 변경 후 다시 `pnpm run build`로 빌드 검증

### 5. 커밋 & 푸시

```bash
git add package.json src/index.ts
git commit -m "chore: bump version to v<version>"
git push origin main
```

### 6. Git Tag & GitHub Release

```bash
git tag -a v<version> -m "v<version>"
git push origin v<version>
```

릴리스 노트는 **2단계 분석 결과를 그대로 활용**해 작성한다 (Highlights / 신규 명령 / 신규 옵션 / 버그 수정 / Full Changelog 링크):

```bash
gh release create v<version> --title "v<version> — <요약>" --notes "<2단계 결과 기반 노트>"
```

자동 생성으로 대체할 경우:
```bash
gh release create v<version> --title "v<version>" --generate-notes
```

### 7. npm Publish

npm publish는 2FA OTP가 필요하므로 사용자에게 직접 실행을 요청한다:

```
npm publish --access public --otp=<code>
```

사용자에게 위 명령을 안내하고, 완료 후 결과를 확인한다.

### 8. 최종 확인

- `https://github.com/jon890/dooray-cli/releases/tag/v<version>` 릴리스 확인
- `https://www.npmjs.com/package/@bifos/dooray-cli` 버전 확인 (반영에 수 분 소요)

## 주의사항

- **빌드 실패 시 릴리스하지 않는다**
- **README/스킬 문서 동기화 누락 시**: 사용자에게 보고하고 보완 commit 후 진행 (사용자가 명시적으로 건너뛰기를 동의하지 않는 한)
- **npm publish는 사용자가 직접 OTP를 입력해야 한다**
- 이전 태그를 force-update하지 않는다 (새 태그만 생성)
