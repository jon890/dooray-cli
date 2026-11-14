# Phase 01. 파일 이동과 경로 갱신을 나누는 도구

**Execution profile**: standard

## 목표

파일 내용이 그대로인 이동 커밋과 경로를 고치는 커밋을 나눌 수 있게 한다.

**범위 외**: 타입 선언을 나누는 작업과 공개 클라이언트 분할.

## 컨텍스트

**요구사항**: REQ6, REQ7, REQ8

**근거 문서**: `docs/features/code-structure/design.md`, `docs/adr/048-checks-to-mjs.md`

## 의도 메모

새 의존성 없이 node 빌트인만 쓴다. 문서 범위는 check-doc-paths.mjs 와 맞춘다.
임시 git 저장소에서 이름 바꾸기 탐지와 내용 보존을 확인하며 실제 서버는 부르지 않는다.

## 작업 항목

### 1. src 기준 옛 경로와 새 경로 쌍의 JSON 배열을 검증하고 짝 테스트도 이동한다. 충돌과 저장소 밖 경로는 쓰기 전에 거절한다.
### 2. rewrite 는 옛 위치로 지정자를 풀고 대상 파일과 이동한 파일의 상대 import 를 고친다. 정적·동적 import, 재내보내기, vitest mock 을 검사한다.
### 3. 문서의 코드 경로를 같은 표로 고친다. 표에 없는 파일의 무관한 import 는 지킨다.

### 4. `scripts/move-paths.test.mjs` 로 정상 이동과 충돌 실패를 검증한다

## 검증

```bash
# cwd: 저장소 루트
pnpm exec vitest run scripts/move-paths.test.mjs
pnpm tsc --noEmit
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `scripts/move-paths.mjs` | 신규 |
| `scripts/move-paths.test.mjs` | 신규 |
