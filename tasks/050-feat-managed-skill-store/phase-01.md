# Phase 01 — 매니페스트·결정론적 해시·관리형 저장소 구현

**Model**: sonnet
**Status**: pending

---

## 목표

task 049의 공개 상태·설치 인터페이스를 유지하면서 스킬 본문을 Node 전역 패키지 경로와 분리된 불변 저장소에 준비한다.

**범위 외**: 자동 `postinstall`, 이전 버전 자동 삭제, rollback 명령, CLI 상태 필드 이름 변경은 이 task에 포함하지 않는다.

---

## 선행 조건

`origin/main`에 task 049 구현 PR이 병합되어 `src/skill/manager.ts`, `src/commands/skill.ts`, `src/version.ts`가 존재해야 한다.
없으면 파일을 추측해 새로 만들지 말고 `PHASE_BLOCKED: task 049 implementation is not on origin/main`을 보고한다.

## 작업 항목 (4)

### 1. `src/skill/manifest.ts` — 매니페스트 스키마와 타입 가드

다음 정확한 스키마를 구현한다.

```typescript
interface DooraySkillManifest {
  schemaVersion: 1;
  skillName: "dooray-cli";
  packageName: "@bifos/dooray-cli";
  packageVersion: string;
  contentDigest: `sha256:${string}`;
  installedAt: string;
  managedBy: "@bifos/dooray-cli";
}
```

`JSON.parse` 결과는 `unknown`으로 받고 `isDooraySkillManifest`로 모든 필드와 SHA-256 형식을 검증한다.
`skillVersion`은 패키지와 별도 릴리스가 없으므로 추가하지 않는다.

### 2. `src/skill/manifest.ts` — 결정론적 콘텐츠 SHA-256

`.dooray-skill.json`을 제외한 `SKILL.md`와 `references/` 아래 정규 파일만 재귀 수집한다.
심볼릭 링크, 장치, 소켓 등 정규 파일이 아닌 항목은 `DoorayCliError`로 거부한다.

상대 경로를 `/`로 정규화하고 코드 포인트 오름차순으로 정렬한다.
해시 입력은 UTF-8 바이트 `dooray-skill-content-v1\0`으로 시작한다.
각 파일마다 경계 바이트 `0x01`, 상대 경로 UTF-8 바이트 길이의 unsigned 64-bit big-endian 정수, 상대 경로 바이트, 콘텐츠 바이트 길이의 unsigned 64-bit big-endian 정수, 원본 콘텐츠 바이트를 순서대로 SHA-256에 반영한다.
길이는 `Buffer.byteLength`와 콘텐츠 `Buffer.length`로 계산한다.
줄바꿈과 파일 내용을 변환하지 않는다.
반환값은 `sha256:<64 lowercase hex>`다.

### 3. `src/skill/manager.ts` — 불변 저장소 준비

`SkillManagerContext`에 optional `dataRoot?: string`을 추가한다.
생략하면 `path.join(context.homeDir, ".local", "share", "dooray-cli")`를 사용하며 테스트에서는 임시 `dataRoot`를 주입한다.
공개 함수 `inspectSkill(context)`와 `installSkill(context, options)` 시그니처 및 `SkillStatus` JSON 필드는 유지한다.
저장 대상은 `skills/<packageVersion>-<64hex>/`다.

현재 package source를 같은 `skills/` 아래 임시 디렉터리에 정규 파일 단위로 복사하고, 복사본 해시를 다시 계산해 source 해시와 같을 때만 매니페스트를 기록한다.
완성된 임시 디렉터리를 `rename`해 최종 경로로 전환한다.
최종 경로가 이미 있으면 매니페스트·경로 version+digest·실제 해시가 모두 기대값과 같은 경우만 재사용한다.
불일치하고 `--force`가 아니면 `DoorayCliError(EXIT_PARAM_ERROR)`로 실패하며 저장소와 활성 링크를 보존한다.
`--force`이면 기존 최종 저장 디렉터리를 같은 `skills/` 아래 `.backup-<UTC timestamp>-<basename>`으로 `rename`한 뒤 staging을 최종 경로로 전환한다.
staging 전환이 실패하면 격리본을 원래 최종 경로로 복구한다.
저장 디렉터리 격리 경로와 활성 링크 백업 경로는 별도 개념으로 구현한다.

### 4. `src/skill/manifest.test.ts`·`src/skill/manager.test.ts` — 스키마·해시·저장 실패 테스트

다음을 고정한다.

- 파일 생성 순서가 달라도 같은 digest
- `SKILL.md` 하나로 구성된 고정 fixture의 digest가 명시된 상수와 일치
- 경로 또는 바이트가 바뀌면 다른 digest
- manifest 제외로 자기참조 없음
- symlink와 비정규 항목 거부
- invalid JSON·누락 필드·잘못된 digest를 corrupt로 분류
- staging 복사 실패·최종 경로 충돌 시 활성 링크 불변
- 같은 canonical store가 modified/corrupt일 때 기본 거부, `--force` 격리·복구
- 같은 version+digest 저장소 재사용

운영 홈 환경변수를 바꾸지 않고 임시 context만 주입한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/skill/manifest.ts` | 신규 — 스키마·타입 가드·해시 |
| `src/skill/manifest.test.ts` | 신규 — manifest/digest 테스트 |
| `src/skill/manager.ts` | 수정 — 관리형 store staging |
| `src/skill/manager.test.ts` | 수정 — 저장소 실패·재사용 테스트 |

## 검증

```bash
# cwd: repository implementation worktree
git merge-base --is-ancestor origin/main HEAD
test -f src/commands/skill.ts
pnpm exec vitest run src/skill/manifest.test.ts src/skill/manager.test.ts
pnpm exec tsc --noEmit
```

모든 명령 종료 코드가 0이어야 한다.

## 의도 메모 (왜)

- task 049와 같은 파일을 확장하므로 병렬 구현하지 않고 049 병합 후 최신 main에서 시작한다.
- digest는 매니페스트를 제외해 자기참조를 막고 경로·길이·바이트 경계를 포함해 결합 충돌을 피한다.
- 최종 store를 불변으로 취급해 status 판정과 복구가 단순해진다.
