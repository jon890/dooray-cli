# Phase 02 — 공개 문서 갱신과 통합 검증

**Execution profile**: standard
**Status**: completed

---

## 목표

구현된 댓글 파일 참조 규칙과 Dooray 댓글 조회 API의 한계를 공개 사용자 문서에 반영하고 저장소 회귀 검증을 마친다.

**범위 외**: 비공개 웹 UI 엔드포인트 역공학, post-level 파일 목록에서 댓글 연결을 추정하는 로직, 새 목록 옵션은 포함하지 않는다.

---

## 작업 항목 (4)

### 1. `README.md` — 간결한 직접 사용 안내에 최소 설명 추가

`## 에이전트 없이 직접 쓰기`의 출력 모드 예시 마지막 명령 뒤에 `### 댓글에 파일 첨부` 절을 추가한다.
삽입 위치는 `dooray post comment add --id "$POST_ID" --body "시작합니다"`와 `## 프로젝트 구조` 사이다.
새 README의 간결한 방향을 유지하도록 다음 내용만 넣는다.

- `dooray post comment file upload <project> <number> <comment-id> <path>` 예시 한 줄
- 이미지 확장자는 이미지 마크다운, 그 외 파일은 일반 링크로 댓글 본문에 추가한다는 문장
- `comment file list`는 웹 UI에서 직접 첨부한 파일을 놓칠 수 있고 이 경우 `post file list`로 확인한다는 문장

명령 전체 목록이나 지원 확장자 전체를 README에 복제하지 않는다.
공개 문서에는 ADR·Issue·task 번호를 넣지 않는다.

### 2. `skills/dooray-cli/SKILL.md` — 빠른 판단 계약 동기화

`## 업무 첨부` 절의 명령 표 바로 아래에 다음 두 판단 규칙을 추가한다.

- 댓글 파일 업로드는 이미지 확장자면 이미지 마크다운, 그 외에는 일반 링크를 만든다.
- `comment file list`가 비어도 웹 UI 첨부가 없다고 단정하지 말고 `post file list`로 확인한다.

확장자 전체와 사용 예는 아래 책임 reference에 두고 라우터에 복제하지 않는다.

### 3. 공개 reference — 상세 계약과 예시 동기화

다음 파일을 책임에 맞게 갱신한다.

- `skills/dooray-cli/references/post.md`
  - 본문 수정 시 첨부를 보호하는 절에서 이미지 마크다운과 일반 링크를 모두 첨부 참조로 설명한다.
  - 추출 예시 정규식의 `!`를 선택적으로 바꾼다.
  - 같은 절 끝에 웹 UI 첨부 누락 가능성과 `post file list` 대체 확인 경로를 적는다.
- `skills/dooray-cli/references/comment.md`
  - `## 단일 댓글 본문 가져오기`의 attachments 설명을 댓글 조회 API가 노출한 파일로 한정한다.
  - 웹 UI 첨부는 누락될 수 있음을 명시한다.
  - 상세 파일 조작 규칙은 `post.md`로 연결한다.
- `skills/dooray-cli/references/workflow.md`
  - `### 댓글에 스크린샷 첨부` 예시 뒤 설명을 실제 업로드 결과로 바꾼다.
  - 이미지 확장자는 이미지 마크다운, 그 외는 일반 링크가 붙는다고 설명한다.

같은 설명을 세 파일에 그대로 복사하지 않고 각 문서가 소유한 판단·조회·자동화 맥락만 남긴다.

### 4. 통합 검증과 task 완료 처리

대상 단위 테스트, `pnpm test`, 타입 검사, 빌드와 문서 검사를 실행한다.
모두 성공한 뒤 `tasks/051-fix-comment-file-reference/index.json`을 다음 최종 상태로 갱신한다.

- task `status`: `completed`
- `current_phase`: `2`
- 두 phase의 `status`: `completed`
- `updated_at`: 완료 시점의 UTC ISO 8601
- `error_message`, `blocked_reason`: `null`

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `README.md` | 수정 — 직접 사용 절의 최소 댓글 파일 안내 |
| `skills/dooray-cli/SKILL.md` | 수정 — 에이전트의 업로드·조회 판단 규칙 |
| `skills/dooray-cli/references/post.md` | 수정 — 두 참조 형식과 조회 대체 경로 |
| `skills/dooray-cli/references/comment.md` | 수정 — 댓글 조회 API가 노출하는 첨부 범위 |
| `skills/dooray-cli/references/workflow.md` | 수정 — 댓글 파일 업로드 결과 설명 |
| `tasks/051-fix-comment-file-reference/index.json` | 수정 — 완료 상태 |

## 검증

```bash
# cwd: 이 task를 실행하는 저장소 작업트리 루트
pnpm exec vitest run src/utils/comment-files.test.ts src/utils/attachment-check.test.ts
pnpm exec tsc --noEmit
pnpm test
pnpm build
rg -q '^### 댓글에 파일 첨부$' README.md
rg -q '이미지.*이미지 마크다운' README.md
rg -q '그 외.*일반 링크' README.md
rg -q 'comment file list.*웹 UI|웹 UI.*comment file list' README.md
rg -q 'post file list' README.md
rg -q '댓글 파일 업로드.*이미지 마크다운.*일반 링크|댓글 파일 업로드.*일반 링크.*이미지 마크다운' skills/dooray-cli/SKILL.md
rg -q 'comment file list.*post file list' skills/dooray-cli/SKILL.md
rg -Fq "grep -oE '!?\[[^]]*\]\(/files/[^)]+\)'" skills/dooray-cli/references/post.md
rg -q 'comment file list.*웹 UI|웹 UI.*comment file list' skills/dooray-cli/references/post.md
rg -q 'post file list' skills/dooray-cli/references/post.md
rg -q '댓글 조회 API.*파일' skills/dooray-cli/references/comment.md
rg -q '웹 UI' skills/dooray-cli/references/comment.md
rg -q 'post.md' skills/dooray-cli/references/comment.md
rg -q '이미지 확장자.*이미지 마크다운' skills/dooray-cli/references/workflow.md
rg -q '그 외.*일반 링크' skills/dooray-cli/references/workflow.md
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/ 2>/dev/null && exit 1 || true
git diff --check
```

모든 명령이 종료 코드 0이어야 한다.
추가로 `CLAUDE.md`의 `개인 식별 정보 / 사내 식별자 노출 금지` 절에 있는 세 검사를 bash와 zsh에서 각각 실행해 허용 목록 밖 결과가 0건인지 확인한다.

완료 상태는 검증 성공 후 다음 명령으로 기록한다.

```bash
# cwd: 이 task를 실행하는 저장소 작업트리 루트
node -e "const fs=require('node:fs');const p='tasks/051-fix-comment-file-reference/index.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.status='completed';d.current_phase=2;d.error_message=null;d.blocked_reason=null;d.updated_at=new Date().toISOString();d.phases.forEach((phase)=>{phase.status='completed'});fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n')"
node -e "const d=require('./tasks/051-fix-comment-file-reference/index.json');if(d.status!=='completed'||d.current_phase!==2||d.phases.some((phase)=>phase.status!=='completed'))process.exit(1)"
```

## 의도 메모 (왜)

- 관리 문서의 결정은 planning 커밋에 반영되어 있으므로 구현 phase에서 다시 수정하지 않는다.
- `2a660ec`에서 README가 명령 카탈로그를 제거했으므로 기능 설명을 짧은 직접 사용 예시와 두 문장으로 제한한다.
- 공개 스킬은 라우터와 책임 reference를 함께 갱신해 에이전트가 어느 진입점으로 읽어도 같은 판단을 하게 한다.
- 웹 UI 첨부 연결은 공개 댓글 조회 API가 노출하지 않으므로 CLI가 완전한 댓글 단위 목록을 보장한다고 쓰지 않는다.

## Blocked 조건

- 테스트나 빌드가 실패하면 task 완료 상태를 기록하지 않고 원인을 수정한다.
- 웹 UI 첨부 연결을 공개 API로 식별할 새 근거가 발견되면 `PHASE_BLOCKED: 댓글 첨부 조회 계약 재설계 필요`를 보고하고 추정 로직을 추가하지 않는다.
