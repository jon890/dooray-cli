# Phase 01 — 버전 단일 원천과 레거시 스킬 상태 관리자 구현

**Model**: sonnet
**Status**: pending

---

## 목표

`package.json`을 CLI 버전의 유일한 원천으로 만들고, 현재 패키지 스킬과 `~/.claude/skills/dooray-cli`의 관계를 출력과 분리된 모듈에서 판정·복구한다.

**범위 외**: Commander 명령 등록, `setup`·`doctor` 연결, 관리형 저장소·매니페스트·콘텐츠 해시는 phase-02와 task 050의 책임이다.

---

## 작업 항목 (4)

### 1. `tsup.config.ts`·`src/version.ts`·`src/index.ts` — 패키지 버전 빌드 주입

`tsup.config.ts`가 저장소 루트 `package.json`의 `version`을 읽어 `__DOORAY_CLI_VERSION__`으로 define 한다.
`src/version.ts`는 `CLI_VERSION`을 export하고, define이 없는 Vitest 문맥에서는 `0.0.0-dev`를 반환하는 `typeof` 가드를 둔다.
`src/index.ts`의 문자열 하드코딩을 `.version(CLI_VERSION)`으로 교체한다.

`.claude/skills/release/SKILL.md`의 버전 변경 절차는 `package.json`만 수정하고 빌드 산출물 일치를 검증하도록 고친다.
이 스킬 파일을 수정하기 전에 설치된 `skill-creator` 지침을 읽고, 구조를 늘리지 않는 최소 변경으로 유지한다.

### 2. `scripts/verify-package.mjs`·`package.json`·`.github/workflows/ci.yml` — 배포 정합성 검증

`pnpm verify:package`가 빌드 후 다음을 검사하도록 별도 스크립트로 구현한다.

- `node dist/index.js --version`이 `package.json.version`과 동일
- `skills/dooray-cli/SKILL.md`와 필수 `references/*.md`가 존재
- 실패 시 이유를 stderr에 쓰고 종료 코드 1, 성공 시 종료 코드 0

CI의 build 다음 단계에서 `pnpm verify:package`를 실행한다.

### 3. `src/skill/manager.ts` — 상태 모델과 안전한 레거시 링크 전환

다음 공개 타입과 함수를 구현한다.

```typescript
type SkillStatusCode =
  | "missing"
  | "current"
  | "outdated"
  | "broken"
  | "unmanaged"
  | "modified"
  | "corrupt";

interface SkillManagerContext {
  homeDir: string;
  packageRoot: string;
  currentVersion: string;
}

interface SkillStatus {
  schemaVersion: 1;
  status: SkillStatusCode;
  destination: string;
  source: string;
  currentVersion: string;
  installedVersion: string | null;
  linkTarget: string | null;
  managed: boolean;
}

interface SkillInstallResult {
  previous: SkillStatus;
  current: SkillStatus;
  changed: boolean;
  backupPath: string | null;
}

inspectSkill(context: SkillManagerContext): Promise<SkillStatus>
installSkill(
  context: SkillManagerContext,
  options?: { force?: boolean },
): Promise<SkillInstallResult>
```

phase 01의 상태 전이는 다음과 같다.

| 입력 | 상태 | 기본 install/update |
|---|---|---|
| 대상 없음 | `missing`, managed | 임시 링크를 만든 뒤 `rename` |
| 현재 source와 같은 링크 | `current`, managed | 무변경 |
| `@bifos/dooray-cli`의 다른 버전 링크 | `outdated`, managed | 현재 source로 원자적 전환 |
| 패키지 스킬 형태의 깨진 링크 | `broken`, managed | 현재 source로 원자적 전환 |
| 알 수 없는 깨진 링크 | `broken`, unmanaged | 종료 코드 3, `--force`만 백업 후 전환 |
| 일반 파일·디렉터리·알 수 없는 정상 링크 | `unmanaged`, unmanaged | 종료 코드 3, `--force`만 백업 후 전환 |

패키지 링크 판정은 대상의 두 단계 상위 `package.json`을 `unknown`으로 파싱한 뒤 `name`·`version` 타입을 검증한다.
깨진 링크는 경로 세그먼트가 `@bifos/dooray-cli/skills/dooray-cli`로 끝나는 경우에만 managed로 본다.
외부 JSON에 `as` 단언을 사용하지 않는다.

원자 전환은 destination과 같은 디렉터리에 임시 링크를 생성한 뒤 `rename`한다.
`--force`는 기존 항목을 `.backup-<UTC timestamp>`로 먼저 `rename`하고, 활성 링크 전환이 실패하면 백업을 원래 경로로 되돌린다.
직접 삭제로 사용자 파일을 제거하지 않는다.

### 4. `src/skill/manager.test.ts` — 임시 디렉터리 상태 전이 회귀 테스트

운영 홈 환경변수를 바꾸지 말고 `mkdtemp`로 만든 `homeDir`·`packageRoot`를 context에 주입한다.
표의 모든 상태와 `--force` 백업·전환 실패 복구를 검증한다.
각 테스트는 자신이 만든 임시 디렉터리만 정리한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `tsup.config.ts` | 수정 — package version define |
| `src/version.ts` | 신규 — `CLI_VERSION` |
| `src/index.ts` | 수정 — 하드코딩 제거 |
| `src/skill/manager.ts` | 신규 — 상태 판정·원자 링크 전환 |
| `src/skill/manager.test.ts` | 신규 — 파일시스템 상태 전이 테스트 |
| `scripts/verify-package.mjs` | 신규 — 배포 정합성 검사 |
| `package.json` | 수정 — `verify:package` |
| `.github/workflows/ci.yml` | 수정 — build 후 검증 |
| `.claude/skills/release/SKILL.md` | 수정 — 단일 버전 원천 절차 |

## 검증

```bash
# cwd: repository implementation worktree
pnpm exec vitest run src/skill/manager.test.ts
pnpm exec tsc --noEmit
pnpm build
pnpm verify:package
test "$(node dist/index.js --version)" = "$(node -p "require('./package.json').version")"
```

모든 명령 종료 코드가 0이어야 한다.

## 의도 메모 (왜)

- 최근 main의 v0.14.1 버전 커밋은 `package.json`만 바꾸고 `src/index.ts`를 놓쳤다. 이 phase가 최종 상태를 빌드 주입으로 바꿔 같은 누락을 구조적으로 제거한다.
- task 050이 같은 `SkillStatus`와 context를 확장하므로 함수명·상태 토큰을 바꾸지 않는다.
- API·resolver·cache는 사용하지 않는 로컬 파일시스템 기능이다.
