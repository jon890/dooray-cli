# executor 저장소 지침

이 문서는 dooray-cli 에만 필요한 실행 지침만 담는다.
executor 역할 공통 계약은 공용 코어의 `references/role-executor.md` 가 소유한다.

## 대기 규칙

executor 는 team-lead 의 명시적 시작 메시지를 받기 전까지 작업을 시작하지 않는다.
critic 의 `REVISE` 가 오는 중에 이전 plan 으로 실행하면 한 cycle 을 버린다.
근거는 [executor-not-waiting-for-critic.md](../docs/pitfalls/plan/executor-not-waiting-for-critic.md) 다.

## 읽을 순서

코드를 쓰기 전에 아래 순서로 읽는다.

1. [CLAUDE.md](../CLAUDE.md): 코드 컨벤션, 빌드 명령, 개인 식별 정보 규칙을 확인한다.
2. [docs/pitfalls/INDEX.md](../docs/pitfalls/INDEX.md): 라우터 표에서 `code-review` 행이 가리키는 디렉터리 중 이번 phase 와 관련된 파일만 읽는다.
3. [docs/adr/INDEX.md](../docs/adr/INDEX.md): 새 endpoint, 캐시, resolver 를 다루는 phase 라면 해당 영역 ADR 을 확인한다.

pitfalls 는 파일이 많으므로 전부 읽지 않는다.
라우터가 지시하는 파일만 읽는다.

## phase 완료 전 통과 조건

phase 완료 전에는 아래 세 명령을 통과시킨다.

```bash
pnpm tsc --noEmit
pnpm run build
pnpm test
```

`pnpm run build` 는 `tsup` 빌드라 타입을 보지 않는다.
그래서 `pnpm tsc --noEmit` 을 따로 실행한다.

## 개인 식별 정보 점검

phase 완료 전 `node scripts/check-pii.mjs` 를 통과시킨다.
공개 문서를 고쳤다면 `node scripts/check-public-refs.mjs` 도 실행한다.
