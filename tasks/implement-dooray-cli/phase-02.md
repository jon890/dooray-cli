# Phase 2: Config · Cache · Doctor 레이어

## 컨텍스트

`dooray-cli`는 Dooray REST API를 CLI로 래핑하는 TypeScript 프로젝트다.
프로젝트 루트: `/Users/nhn/personal/dooray-cli`
이전 phase에서 프로젝트 초기화 완료: package.json, tsconfig, tsup, Commander 스켈레톤, utils/errors, exit-codes, spinner.

설계 문서:
- `docs/data-schema.md` — config.json, cache.json 스키마, TTL 설계
- `docs/flow.md` — 최초 설정 흐름, 캐시 흐름
- `docs/code-architecture.md` — config/, cache/ 모듈 구조

## 목표

`~/.dooray/config.json`과 `~/.dooray/cache.json`을 관리하는 레이어를 구현하고, `dooray config`, `dooray cache`, `dooray doctor` 커맨드를 동작시킨다.

## 작업 목록

- [ ] `src/config/types.ts` — Config 인터페이스 (`{ version: 1, apiKey: string, baseUrl: string }`)
- [ ] `src/config/store.ts` — ConfigStore 구현
  - `getConfig()`: `~/.dooray/config.json` 읽기, 없으면 null 반환
  - `setConfigValue(key, value)`: 개별 키 설정 후 저장
  - `getConfigOrThrow()`: 미설정 시 DoorayCliError(CONFIG_ERROR) throw + 안내 메시지
  - `~/.dooray/` 디렉터리 자동 생성 (없으면)
- [ ] `src/cache/types.ts` — Cache, CachedProject, CachedMember, CachedWorkflow 인터페이스
  - TTL 상수: PROJECTS_TTL_MS = 3600000 (1h), MEMBERS_TTL_MS = 3600000 (1h), WORKFLOWS_TTL_MS = 86400000 (24h)
- [ ] `src/cache/store.ts` — CacheStore 구현
  - `getCache()`: `~/.dooray/cache.json` 읽기, 없으면 빈 캐시 반환
  - `saveCache(cache)`: JSON 저장
  - `isExpired(updatedAt, ttlMs)`: TTL 만료 체크
  - `clearCache()`: 캐시 파일 삭제
  - `getProjects()`, `setProjects(items)`: 프로젝트 캐시 get/set
  - `getMembers(projectId)`, `setMembers(projectId, items)`: 멤버 캐시 get/set
  - `getWorkflows(projectId)`, `setWorkflows(projectId, items)`: 워크플로우 캐시 get/set
- [ ] `src/commands/config.ts` — `dooray config` 서브커맨드
  - `dooray config set <key> <value>` — api-key, base-url 설정
  - `dooray config get [key]` — 전체 또는 개별 설정 출력 (api-key는 마스킹)
- [ ] `src/commands/cache.ts` — `dooray cache` 서브커맨드
  - `dooray cache clear` — 캐시 전체 삭제
  - `dooray cache refresh` — 이 단계에선 clear만 (API 클라이언트가 아직 없으므로, Phase 3 이후 refresh 보강)
- [ ] `src/commands/doctor.ts` — `dooray doctor` 서브커맨드
  - API key 설정 여부 확인 (✅/❌)
  - Base URL 설정 여부 확인 (✅/❌)
  - API 연결 테스트는 Phase 3 이후 추가 (이 단계에선 설정 검증만)
  - 캐시 상태 확인 (존재 여부, 항목 수)
- [ ] `src/index.ts` 에 config, cache, doctor 커맨드 등록

## 성공 기준

1. `npm run build` 성공
2. `node dist/index.js config set api-key test-key-123` 실행 후 `~/.dooray/config.json`에 apiKey 저장됨
3. `node dist/index.js config set base-url https://<tenant>.dooray.com` 실행 후 baseUrl 저장됨
4. `node dist/index.js config get` 실행 시 설정 출력 (apiKey 마스킹)
5. `node dist/index.js doctor` 실행 시 설정 상태 출력
6. `node dist/index.js cache clear` 실행 시 캐시 삭제

## 주의사항

- config.json에 apiKey를 평문으로 저장한다 (MVP 범위, ADR-007 참고)
- `~/.dooray/` 경로는 `os.homedir()` 사용, 하드코딩 금지
- config set의 key는 kebab-case (`api-key`, `base-url`) 입력을 camelCase로 변환하여 저장
- cache.json은 아직 비어있는 상태로 생성만 가능 (API 연동은 Phase 3)

## Blocked 조건

`~/.dooray/` 디렉터리 생성 권한 문제 시:
`PHASE_BLOCKED: ~/.dooray 디렉터리 생성 실패 — 파일시스템 권한 확인 필요`
