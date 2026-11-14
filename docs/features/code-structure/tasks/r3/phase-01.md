# Phase 01. 파일을 새 책임에 맞는 폴더로 옮긴다

**Execution profile**: standard

## 목표

설계의 R3 재분류 표를 move-paths.mjs 의 move 단계로 옮긴다. 내용은 바꾸지 않는다.

**범위 외**: 사용자 동작 변경, R4 명령 나무 정리, 서버 호출.

## 컨텍스트

**요구사항**: REQ1, REQ5, REQ6, REQ7, REQ8

기준 커밋에서 전체 테스트와 빌드를 실행하고 도움말을 세션 임시 폴더에 보관한다.
설계가 정한 파일과 짝 테스트만 이동한다. feedback 명령 진입점의 이동은 내용 수정 단계에서 한다.

**근거 문서**: `docs/features/code-structure/design.md`

## 작업 항목

### 본문 규칙을 body/, comment-enrich 를 formatters/, feedback-meta 를 commands/feedback/meta, mail-attach 를 commands/mail/attach 로 옮긴다.
### 파일 내용을 유지한 이동만 커밋한다.
### 이름 바꾸기 탐지가 100% 인지 확인한다.

### 기존 본문 입력 테스트를 유지한다

`src/body/body-input.test.ts` 의 파일·stdin·오류 검증을 그대로 보존한다.

## 검증

`git diff --cached -M --summary` 로 이동 이력을 확인한다. 중간 커밋은 import 수정 전이라 빌드하지 않는다.

```bash
git diff --cached -M --summary
# import 수정 뒤 phase 02 에서 실행
pnpm test
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/utils/*.ts` | 수정 (설계 표의 구현과 짝 테스트 이동) |
| `src/body/*.ts` | 신규·수정 (이동 목적지) |
| `src/formatters/comment-enrich*.ts` | 신규 (이동 목적지) |
| `src/commands/feedback/meta*.ts` | 신규 (이동 목적지) |
| `src/commands/mail/attach*.ts` | 신규 (이동 목적지) |

| `src/body/*.test.ts` | 신규·수정 (기존 테스트 이동) |

| `src/body/body-input.test.ts` | 수정 (기존 입력 테스트 유지) |
