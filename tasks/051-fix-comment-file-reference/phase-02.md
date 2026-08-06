# Phase 02 — 공개 문서 갱신과 통합 검증

**Execution profile**: standard
**Status**: pending

---

## 목표

구현된 댓글 파일 참조 규칙과 Dooray 댓글 조회 API의 한계를 공개 사용자 문서에 반영하고 저장소 회귀 검증을 마친다.

**범위 외**: 비공개 웹 UI 엔드포인트 역공학, post-level 파일 목록에서 댓글 연결을 추정하는 로직, 새 목록 옵션은 포함하지 않는다.

---

## 작업 항목 (3)

### 1. `README.md` — 업로드 형식과 목록 한계 안내

`댓글 첨부 파일 (post comment file *)` 절에 다음 내용을 반영한다.

- 이미지 확장자는 댓글 본문에 이미지 마크다운으로 추가한다.
- 그 외 파일은 클릭 가능한 일반 링크로 추가한다.
- `comment file list`는 댓글 조회 API가 반환한 파일만 보여주므로 웹 UI에서 직접 첨부한 파일이 누락될 수 있다.
- 누락된 웹 UI 첨부는 업무 단위 `post file list`로 확인한다.

공개 문서에는 ADR·Issue·task 번호를 넣지 않는다.

### 2. `skills/dooray-cli/SKILL.md` — 에이전트 사용 계약 동기화

`업무 첨부` 절의 댓글 첨부 표 아래에 README와 같은 생성 규칙과 조회 한계를 간결하게 추가한다.
에이전트가 웹 UI 첨부를 찾지 못했을 때 `post file list`로 범위를 넓혀 확인하도록 안내한다.
명령 표와 사용 예를 중복 복사하지 않는다.

### 3. 통합 검증과 task 완료 처리

대상 단위 테스트, 전체 테스트, 타입 검사, 빌드와 문서 검사를 실행한다.
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
| `README.md` | 수정 — 참조 형식과 웹 UI 첨부 조회 한계 |
| `skills/dooray-cli/SKILL.md` | 수정 — 자동화 사용 계약과 대체 확인 경로 안내 |
| `tasks/051-fix-comment-file-reference/index.json` | 수정 — 완료 상태 |

## 검증

```bash
# cwd: 이 task를 실행하는 저장소 작업트리 루트
pnpm exec vitest run src/utils/comment-files.test.ts src/utils/attachment-check.test.ts
pnpm exec tsc --noEmit
pnpm test
pnpm build
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
- 공개 문서는 실제 구현 결과와 함께 갱신해 사용자 안내와 동작이 어긋나지 않게 한다.
- 웹 UI 첨부 연결은 공개 댓글 조회 API가 노출하지 않으므로 CLI가 완전한 댓글 단위 목록을 보장한다고 쓰지 않는다.

## Blocked 조건

- 테스트나 빌드가 실패하면 task 완료 상태를 기록하지 않고 원인을 수정한다.
- 웹 UI 첨부 연결을 공개 API로 식별할 새 근거가 발견되면 `PHASE_BLOCKED: 댓글 첨부 조회 계약 재설계 필요`를 보고하고 추정 로직을 추가하지 않는다.
