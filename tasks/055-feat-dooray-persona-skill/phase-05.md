# Phase 05 — 패키지 범위 조정, README 안내, 통합 검증

**Execution profile**: standard

---

## 목표

새 스킬이 CLI 설치·배포 경로에 섞여 들어가지 않게 막고, 사용자가 내려받아 쓰는 방법을 README 에 남긴 뒤 전체를 검증한다.
마지막 phase 이므로 task 완료 마킹까지 한다.

**범위 외**: 설치 명령(`dooray skill`)을 여러 스킬로 확장하지 않는다. 이 스킬은 관리형 설치 체계 밖에 두기로 한 결정을 따른다.

---

## 작업 항목 (4)

### 1. `package.json` — npm 패키지 범위 좁히기

`files` 배열의 `"skills"` 를 `"skills/dooray-cli"` 로 바꾼다.

새 스킬은 설치 대상이 아니므로 npm tarball 에 넣을 이유가 없다.
`"skills"` 를 그대로 두면 전역 설치 사용자에게 쓰이지 않는 파일이 배포되고, 설치되지 않았는데 파일은 있는 헷갈리는 상태가 된다.

기존 스킬의 설치 경로가 그대로인지 확인한다. `src/skill/manager.ts` 는 **건드리지 않는다.**

### 2. `README.md` — 사용법 추가

새 절을 하나 추가한다. 기존 절 순서를 바꾸지 않고 적절한 위치에 끼운다.

담을 내용은 다음과 같다.

- 이 스킬이 무엇을 하는지 두세 문장 — Dooray 에 쌓인 본인 글을 모아 업무 글 문체 문서를 만들고, 그 문서를 AI 에게 물려 본인 문체로 쓰게 한다
- CLI 설치 명령의 대상이 아니라는 점과 그 이유 한 줄
- 내려받아 쓰는 방법 — 저장소를 clone 한 뒤 `skills/dooray-persona` 를 `~/.claude/skills/` 로 링크하거나 복사한다
- 설정 파일 위치와 최초 실행 흐름 한 줄
- 인증은 `dooray setup` 으로 만든 설정을 읽어 쓰므로 별도 토큰 입력이 없다는 점

**내부 추적 번호를 쓰지 않는다.** `ADR-NNN`, `Issue #NN`, `task NN` 이 들어가면 안 된다.

### 3. 통합 검증

아래를 순서대로 실행해 모두 통과시킨다.

```bash
# cwd: <repo root>
pnpm install
pnpm tsc --noEmit
pnpm test
pnpm run build
pnpm run verify:package
```

`src/` 를 건드리지 않았으므로 기존 테스트가 그대로 통과해야 한다.
하나라도 깨지면 이 phase 의 변경이 원인인지 먼저 확인한다.

패키지에 새 스킬이 들어가지 않는지 실제 목록으로 확인한다.

```bash
# cwd: <repo root>
npm pack --dry-run --json | grep -c "dooray-persona"
```

- 출력이 0 이다.

```bash
# cwd: <repo root>
npm pack --dry-run --json | grep -c "skills/dooray-cli/SKILL.md"
```

- 출력이 1 이상이다. 기존 스킬은 계속 포함된다.

공개 문서 검증을 돌린다.

```bash
# cwd: <repo root>
grep -rnE "ADR-[0-9]+|Issue #[0-9]+|task [0-9]+" README.md skills/
```

- 출력이 0 줄이다.

`CLAUDE.md` 의 "개인 식별 정보 / 사내 식별자 노출 금지" 절에 있는 검증 grep 3종을 실행한다.

- 도메인 검사와 19자리 숫자 검사가 0건이다.
- 프로젝트 코드 검사 결과에 가상 값 외의 값이 없다.

### 4. task 완료 마킹

`tasks/055-feat-dooray-persona-skill/index.json` 의 `status` 를 `completed` 로, `current_phase` 를 5 로, `updated_at` 을 현재 시각으로 바꾼다.
모든 phase 항목의 `status` 도 `completed` 로 바꾼다.

---

## Critical Files

| 파일 | 변경 |
| --- | --- |
| `package.json` | 수정 |
| `README.md` | 수정 |
| `tasks/055-feat-dooray-persona-skill/index.json` | 수정 |

## 검증

위 3번 항목의 명령이 모두 기대값을 만족한다.
`git status` 에 의도하지 않은 변경 파일이 없다.

## 의도 메모 (왜)

- npm 배포 범위를 좁히는 이유는, 설치되지 않는 파일이 패키지에 들어 있으면 사용자가 "왜 스킬이 안 뜨지" 로 혼란을 겪기 때문이다.
- README 를 마지막 phase 로 미룬 이유는, 사용자 가이드가 실제 산출물에 의존해서다. 앞에서 쓰면 스크립트 이름이 바뀔 때마다 어긋난다.
- `src/skill/manager.ts` 를 건드리지 않는 것이 이 plan 의 경계다. 설치기를 여러 스킬로 확장하는 비용이 스킬 본체보다 커서 범위 밖으로 뒀다.
