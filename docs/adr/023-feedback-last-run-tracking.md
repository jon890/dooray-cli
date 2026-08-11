## ADR-023: `feedback --last` last-run 추적 — opt-in + 에러시만 + 최소 세트 + argv 마스킹

**결정**: 4 가지 정책 동시 적용.
1. **opt-in**: `config.json` 의 `trackLastRun: true` 일 때만 동작
2. **에러시만**: `src/index.ts` 최상위 `catch` 에서만 `~/.dooray/last-run.json` 작성
3. **최소 세트**: argv (sanitized), exitCode, errorMessage, timestamp. `cwd`/`env` 제외
4. **argv 패턴 마스킹**: `--api-key=*` / `--token=*` / `--password=*` / `Authorization: Bearer *`

`feedback` 자체는 기록 안 함 (재귀 방지).
단일 파일 덮어쓰기 — use case 는 직전 1건만.

**맥락**: 모든 명령 종료 시점 디스크 I/O 는 전역 부수 효과 — dooray-cli 는 자동화 스크립트에서 자주 호출되어 의도 없는 매번 파일 쓰기는 부담.
성공 명령 기록은 효용 ↓ 부수효과 ↑.
cwd 가 사내 경로일 가능성 (`/Users/.../<project>/...`) — CLAUDE.md 개인 식별 정보 점검과 일관.
사용자가 `--header "Authorization: ..."` 추가 가능성으로 마스킹은 안전망.

**대안 기각**:
- 기본 on과 opt-out — 부수 효과가 사용자 인지 없이 작동 (privacy 우려)
- 모든 명령 hook (commander preAction/postAction) — src/index.ts 구조 변경 ↑, 성공 명령 가치 낮음
- 풀세트 (cwd/env 포함) — 개인 식별 정보 사전 점검 모순
- argv 전체 제외 (명령 이름만) — 재현 명령을 손으로 적어야, `--last` 가치 ↓

저장 위치 / sanitization 룰 / 시작 패턴은 `src/cache/last-run.ts` 참조. cache 외부 (`cache clear` 영향 없음).
