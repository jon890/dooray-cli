# Phase 01 — 파일 종류별 댓글 참조 생성과 삭제 회귀 테스트

**Execution profile**: standard
**Status**: pending

---

## 목표

`dooray post comment file upload`가 이미지 파일만 이미지 마크다운으로 표시하고, 비이미지 파일은 클릭 가능한 일반 링크로 표시되게 한다.
`delete`가 기존 이미지 참조와 새 일반 링크 참조를 모두 제거하도록 회귀 테스트로 고정한다.

**범위 외**: 명령 시그니처·출력 형식·API 클라이언트·댓글 목록 로직 변경, MIME 또는 파일 내용 검사, 새 의존성 추가는 포함하지 않는다.

---

## 선행 확인

- `src/commands/post/comment/file/upload.ts`가 `appendFileReference`를 호출하는지 확인한다.
- `src/commands/post/comment/file/delete.ts`가 `removeFileReference`를 호출하는지 확인한다.
- `src/utils/attachment-check.ts`가 이미 이미지와 일반 링크의 `/files/<fileId>`를 모두 인식하는지 확인한다.

## 작업 항목 (3)

### 1. `src/utils/comment-files.ts` — 이미지 확장자 판별

모듈 내부 상수 `IMAGE_FILE_EXTENSION_RE`를 다음 계약으로 추가한다.

```typescript
const IMAGE_FILE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i;
```

`appendFileReference(body, fileName, fileId)`의 공개 시그니처는 유지한다.
기존처럼 파일명에서 `[`와 `]`를 제거한 `safeName`을 만든 뒤 확장자를 판별한다.

- 이미지면 `![safeName](/files/<fileId>)`를 추가한다.
- 그 외 확장자와 확장자 없는 파일이면 `[safeName](/files/<fileId>)`를 추가한다.
- 기존 본문과 빈 줄 하나로 분리하는 규칙은 바꾸지 않는다.

### 2. `src/utils/comment-files.ts` — 두 참조 형식 삭제

`removeFileReference(body, fileId)`의 공개 시그니처와 fileId 정규식 이스케이프를 유지한다.
참조 패턴의 앞 `!`만 선택적으로 바꿔 `![name](/files/<fileId>)`와 `[name](/files/<fileId>)`를 모두 제거한다.
참조만 있는 줄은 줄 전체를 제거하고, 다른 텍스트와 같은 줄에 있으면 참조만 제거하는 기존 규칙도 두 형식에 동일하게 적용한다.

### 3. `src/utils/comment-files.test.ts` — 생성·삭제 계약 고정

기존 테스트를 유지하면서 다음 사례를 추가하거나 표 기반 테스트로 정리한다.

- 각 지원 이미지 확장자가 이미지 마크다운을 생성한다.
- 대표 대문자 확장자도 이미지로 판별한다.
- `html`, `pdf`, `xlsx`와 확장자 없는 파일은 일반 링크를 생성한다.
- 일반 링크가 단독 줄과 문장 안에 있을 때 모두 제거된다.
- 이미지와 일반 링크가 같은 fileId를 참조하면 둘 다 제거된다.
- 파일명 괄호 제거, 줄 간격, 다른 fileId 보존, 정규식 특수문자 fileId의 기존 회귀 테스트는 유지한다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `src/utils/comment-files.ts` | 수정 — 확장자별 참조 생성과 두 형식 삭제 |
| `src/utils/comment-files.test.ts` | 수정 — 이미지·비이미지·삭제 회귀 테스트 |

## 검증

```bash
# cwd: 이 task를 실행하는 저장소 작업트리 루트
git log origin/main --oneline -10 -- src/utils/comment-files.ts src/utils/comment-files.test.ts src/commands/post/comment/file
rg -n "appendFileReference|removeFileReference" src/commands/post/comment/file/{upload,delete}.ts
pnpm exec vitest run src/utils/comment-files.test.ts src/utils/attachment-check.test.ts
pnpm exec tsc --noEmit
git diff --check
```

모든 명령이 종료 코드 0이어야 한다.
테스트는 확장자 분류와 이미지·일반 링크 삭제를 구현 코드의 비공개 상수를 직접 가져오지 않고 공개 함수 결과로 검증한다.

## 의도 메모 (왜)

- 업로드·삭제 명령이 이미 순수 헬퍼를 호출하므로 명령 계층을 중복 수정하지 않는다.
- 최근 comment-file 변경은 명령 도움말·입력 해석·스피너 방어에 집중되어 있으므로 해당 명령과 resolver를 보존하고 헬퍼 경계만 수정한다.
- 확장자 판별은 추가 I/O와 MIME 판별 의존성을 만들지 않는 최소 수정이다.
- `attachment-check.ts`가 이미 두 참조 형식을 인식하므로 삭제 헬퍼도 같은 문법 범위를 갖게 한다.

## Blocked 조건

- Dooray가 일반 링크 `/files/<fileId>`를 클릭 가능한 파일로 렌더하지 않는다는 새 실측 근거가 나오면 `PHASE_BLOCKED: 일반 링크 렌더 계약 재검토 필요`를 보고하고 범위를 임의로 넓히지 않는다.
