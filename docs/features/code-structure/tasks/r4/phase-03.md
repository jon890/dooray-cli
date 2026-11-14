# Phase 03. 명령 파일의 영역 로직을 같은 영역의 주제 파일로 뺀다

**Execution profile**: standard

## 목표

설계 「진단」 의 명령 파일 여섯 개에서 영역 로직을 같은 영역의 주제 파일로 뺀다. 명령 파일에는 옵션 해석과 출력만 남긴다.

**범위 외**: 새 계층, 사용자 동작 변경.

## 컨텍스트

**요구사항**: REQ1

파일마다 한 커밋으로 나눈다. 이름 풀이는 `resolvers/`, 캐시 무효화가 필요한 쓰기는 `services/` 로 보내는 규칙을 지키며, 해당하는 쓰기는 없었다. 이 단계는 파일을 옮기지 않고 새 파일을 더한다.

**근거 문서**: `docs/features/code-structure/design.md`

## 작업 항목

### stream list → `stream/feed.ts`
### messenger channels → `messenger/channel-list.ts`
### wiki page move → `wiki/page-move-request.ts`, `resolvers/wiki.ts` 의 `resolveTargetWikiId`
### calendar event delete·edit → `event-delete-rules.ts`, `event-edit-rules.ts`
### post comment get → `post/comment/comment-lookup.ts`
### 옮긴 규칙의 단위 테스트를 더하고 기존 테스트의 import 만 바꾼다.
### 옮긴 규칙의 단위 테스트(`event-delete-rules.test.ts`, `event-edit-rules.test.ts`, `comment-lookup.test.ts`)를 더하고 기존 테스트는 import 만 바꾼다.

## 검증

```bash
pnpm test
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/commands/stream/feed.ts` | 신규 |
| `src/commands/stream/list.ts` | 수정 |
| `src/commands/stream/list.test.ts` | 수정 |
| `src/commands/messenger/channel-list.ts` | 신규 |
| `src/commands/messenger/channels.ts` | 수정 |
| `src/commands/messenger/channels.test.ts` | 수정 |
| `src/commands/wiki/page-move-request.ts` | 신규 |
| `src/commands/wiki/page-move.ts` | 수정 |
| `src/commands/wiki/page-move.test.ts` | 수정 |
| `src/resolvers/wiki.ts` | 수정 |
| `src/resolvers/wiki.test.ts` | 수정 |
| `src/commands/calendar/event-delete-rules.ts` | 신규 |
| `src/commands/calendar/event-delete-rules.test.ts` | 신규 |
| `src/commands/calendar/event-delete.ts` | 수정 |
| `src/commands/calendar/event-edit-rules.ts` | 신규 |
| `src/commands/calendar/event-edit-rules.test.ts` | 신규 |
| `src/commands/calendar/event-edit.ts` | 수정 |
| `src/commands/post/comment/comment-lookup.ts` | 신규 |
| `src/commands/post/comment/comment-lookup.test.ts` | 신규 |
| `src/commands/post/comment/get.ts` | 수정 |
