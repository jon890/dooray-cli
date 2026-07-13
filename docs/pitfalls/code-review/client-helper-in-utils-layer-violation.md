---
id: client-helper-in-utils-layer-violation
category: code-review
title: client 의존 helper 를 `utils/` 에 두면 layer 위반
triggers: [utils, resolvers, layer 컨벤션, DoorayApiClient]
tool_catchable: false
source: [CLI14, PR #44]
related: []
---

**증상**: 새 helper (`resolveTaskLinks(client, ...)`) 가 도메인 응집을 이유로 `src/utils/task-link.ts` (기존 `escapeLinkText` / `buildTaskLink` 동거 모듈) 에 작성됨.
utils 는 client 의존 없는 building blocks 가 컨벤션 — `mention.ts` 의 `prependMentions` 도 client 안 받음.
**Good**: client 를 받는 함수는 `src/resolvers/` (예: `src/resolvers/task-link.ts` 신규). 같은 도메인의 building blocks 는 utils, lookup / API 호출 orchestrator 는 resolvers 로 분리. 같은 디렉터리 이름 충돌은 layer 가 우선.
**검출**: `grep -nE "DoorayApiClient" src/utils/*.ts` 결과 0 건 유지. utils 안에 client import 가 등장하면 resolver 후보.
**Why**: PR #44 review — task-link orchestrator 를 utils 에 두는 안과 resolvers 에 두는 안 둘 다 "허용" 댓글이 있었으나, layer 컨벤션 (utils=building block, resolvers=client+cache+lookup) 에 따르면 resolvers 가 정답.
잘못 두면 utils 가 점진적으로 client 의존 모듈로 오염.
