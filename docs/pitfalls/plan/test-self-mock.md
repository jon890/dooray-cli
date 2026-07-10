---
id: test-self-mock
category: plan
title: "테스트 mock — self-mock (vi.mock(\"./same-file.js\")) 금지"
triggers: [vi.mock, self-mock, flaky test, CommonJS]
tool_catchable: false
source: [1-17, plan039]
related: []
---

**증상**: `vi.mock("./project.js", ...)` 처럼 테스트 대상 파일 자체를 mock 하면 동일 파일 내부 함수 참조가 교체되지 않아 실제 구현이 호출됨.
캐시/네트워크 접근이 발생하여 환경마다 flaky.

**self-check**:
```bash
# phase 의 테스트 코드 블록에서 vi.mock 경로가 테스트 대상과 같은 파일인지 확인
grep -n 'vi\.mock("\./' tasks/*/phase-*.md
# "vi.mock("./project.js")" 같이 같은 디렉터리 파일을 mock 하면 self-mock 의심
```

**대안**: 테스트 대상이 내부에서 호출하는 **외부 의존성** (`../cache/store.js` 등) 을 mock.
기존 패턴: `member-group.test.ts` 참조.

**Why**: plan039 critic REVISE — `ensureProjects` 를 self-mock 했으나 CommonJS 번들에서 동일 파일 내부 참조는 원본 유지. 실제 `getProjects` 가 `~/.dooray/cache/` 에 접근하며 flaky 테스트 발생.
