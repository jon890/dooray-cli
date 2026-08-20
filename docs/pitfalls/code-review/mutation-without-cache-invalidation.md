---
id: mutation-without-cache-invalidation
category: code-review
title: 캐시된 엔티티를 바꾸고 캐시를 지우지 않음
triggers: [캐시 무효화, clearTags, mutation, TTL, services 쓰기 함수, ADR-042]
tool_catchable: false
source: [Issue #146, ADR-042]
related: [cache-atomic-write-consistency, missing-four-surface-guard]
---

**증상**: 캐시되는 엔티티(프로젝트, 멤버, 워크플로우, 태그, 단계, 멤버그룹, 템플릿, 위키)를 바꾸는
API 를 호출하고 그 엔티티의 캐시 파일을 지우지 않는다.
대부분의 TTL 이 24시간이라 방금 바꾼 것을 다음 명령이 최대 24시간 보지 못한다.
명령 자체는 성공으로 끝나고 에러도 없어서, 사용자는 서버가 반영되지 않은 것으로 오해한다.

**Good**: 쓰기 호출을 `src/services/<엔티티>.ts` 의 함수로 감싸고, 그 함수가 성공 직후 캐시 파일을 지운다.
명령 파일이 `api/client` 의 쓰기 메서드를 직접 부르고 따로 캐시를 지우는 형태를 만들지 않는다.
`src/resolvers/` 는 읽기 전용이라 쓰기 함수를 넣지 않는다.
`api/client` 안에서 캐시를 지우는 것도 금지다. 순수 HTTP 래퍼 규칙과 의존 방향을 함께 깬다.
캐시 삭제가 실패하면 경고만 내고 명령은 성공으로 끝낸다. 실패로 만들면 사용자가 재시도해 중복 생성된다.

**검출**: 새 쓰기 메서드를 추가했을 때, 그 엔티티가 캐시되는지 먼저 본다.

```bash
# cwd: <repo root>
# 1) 캐시되는 엔티티 목록
grep -n "^export async function set" src/cache/store.ts

# 2) 명령 파일이 쓰기 메서드를 직접 부르는 지점을 찾는다
grep -rn "client\.\(create\|update\|delete\|set\)" src/commands/ | grep -v "\.test\.ts"
```

두 번째 grep 이 명령 파일에서 직접 쓰기 호출을 하는 지점을 낸다.
그 대상이 캐시되는 엔티티면 `src/services/` 의 함수로 옮겨야 한다.

`resolvers` 에 쓰기가 섞였는지도 본다. 아래 출력이 없어야 한다.

```bash
# cwd: <repo root>
grep -rn "client\.\(create\|update\|delete\|set\)" src/resolvers/ | grep -v "\.test\.ts"
```

**Self-check**: 새 쓰기 메서드의 대상이 `src/cache/store.ts` 의 `set*` 함수 중 하나에 대응하는가?
대응하면 `src/services/` 의 함수와 그 안의 무효화가 있는가?

**Why**: Issue #146 의 태그 생성이 캐시되는 엔티티를 바꾸는 첫 명령이었다.
그전까지 쓰기 메서드 13개는 업무·댓글·위키 페이지·첨부파일·메시지만 다뤘고 셋 다 캐시하지 않아
이 실수가 나올 자리가 없었다.
태그를 만들어도 `post create --tag` 가 24시간 찾지 못하면 태그를 만든 목적 자체가 무너진다.
`POST .../milestones` 처럼 같은 성질의 endpoint 가 공식 API 에 남아 있어 재발한다.
