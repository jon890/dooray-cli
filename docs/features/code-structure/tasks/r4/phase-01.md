# Phase 01. resolver 가 영역 인터페이스만 받게 한다

**Execution profile**: standard

## 목표

resolver 9곳이 받는 `DoorayClient` 를 쓰는 영역 인터페이스(또는 그 교집합)로 좁히고, 규칙 테스트의 허용 목록을 비운다.

**범위 외**: 사용자 동작 변경, resolver 안의 로직 변경.

## 컨텍스트

**요구사항**: REQ4, REQ5

호출하는 쪽은 `DoorayClient` 를 그대로 넘기므로 구조적 타입으로 맞는다. 안에서 다른 resolver 로 넘기는 값의 타입이 교집합의 부분집합이어야 한다.

**근거 문서**: `docs/features/code-structure/design.md`

## 작업 항목

### 각 resolver 가 부르는 메서드를 찾아 영역 인터페이스를 고른다.
### `ALLOWED_VIOLATIONS` 를 비우고, 목록이 비어 있음을 보는 테스트로 바꾼다.
### `docs/code-architecture.md` 「의존 규칙」 의 허용 목록 안내를 고친다.
### 허용 목록이 비어 있는지 `src/architecture.test.ts` 로 확인한다.

## 검증

```bash
pnpm tsc --noEmit
pnpm vitest run src/architecture.test.ts
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/resolvers/comment-file-input.ts` | 수정 |
| `src/resolvers/messenger-channel.ts` | 수정 |
| `src/resolvers/post-input.ts` | 수정 |
| `src/resolvers/post-users.ts` | 수정 |
| `src/resolvers/post.ts` | 수정 |
| `src/resolvers/postRef.ts` | 수정 |
| `src/resolvers/task-link.ts` | 수정 |
| `src/resolvers/wiki-page-input.ts` | 수정 |
| `src/resolvers/wiki.ts` | 수정 |
| `src/architecture.test.ts` | 수정 |
| `docs/code-architecture.md` | 수정 |
