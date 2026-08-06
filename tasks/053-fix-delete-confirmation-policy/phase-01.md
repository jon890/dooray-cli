# Phase 01 — 공통 삭제 확인 정책과 여섯 명령 회귀 테스트 구현

**Model**: sonnet
**Status**: pending

---

## 목표

Issue #113의 여섯 삭제 명령이 하나의 공통 유틸리티를 통해 같은 확인·비대화형 안전 정책을 실행하도록 구현한다.

**범위 외**: 삭제 API 메서드와 성공 출력 스키마 변경, `mail logout` 등 원격 업무 데이터를 삭제하지 않는 명령, 새 의존성 추가, planning 결정 문서 수정은 포함하지 않는다.

---

## 선행 계약

- `CLAUDE.md`의 파괴적 삭제 명령 규약과 `docs/adr/036-delete-confirmation-policy.md`를 먼저 읽는다.
- planning 결정 문서는 현재 브랜치에 반영되어 있다. 구현 전에 아래 의미 기반 검증으로 계약이 남아 있는지 확인한다.
- 이 phase에서는 `CLAUDE.md`, `docs/prd.md`, `docs/flow.md`, `docs/code-architecture.md`, `docs/data-schema.md`, `docs/adr/`를 수정하지 않는다.
- 기존 삭제 API와 resolver를 재사용한다. 확인 정책을 위해 `src/api/client.ts`나 `src/resolvers/`를 수정하지 않는다.

```bash
# cwd: repository implementation worktree
test -f docs/adr/036-delete-confirmation-policy.md
grep -Fq '**파괴적 삭제 명령**' CLAUDE.md
grep -Fq 'delete-confirmation.ts' docs/code-architecture.md
grep -Fq '## 삭제 확인 공통 흐름 (ADR-036)' docs/flow.md
```

네 검증 명령 중 하나라도 실패하면 planning 계약이 재기반 과정에서 사라진 것이므로 구현하지 않고 `PHASE_BLOCKED: delete confirmation planning contract is missing`을 보고한다.

---

## 작업 항목 (4)

### 1. `src/utils/delete-confirmation.ts` — API 비의존 공통 확인 정책

다음 책임을 분리해 구현한다.

```typescript
export type ConfirmDeletion = () => Promise<boolean>;

export async function authorizeDeletion(
  skipConfirmation: boolean,
  isTTY: boolean,
  confirmDeletion: ConfirmDeletion,
): Promise<boolean>;

export async function promptDeletion(message: string): Promise<boolean>;
```

`authorizeDeletion`은 다음 순서만 담당한다.

1. `skipConfirmation`이 참이면 확인 함수를 호출하지 않고 `true`를 반환한다.
2. 플래그가 없고 `isTTY`가 거짓이면 `DoorayCliError`를 `EXIT_PARAM_ERROR`로 던진다. 메시지에는 non-TTY와 `--yes(-y)` 재실행 안내를 포함한다.
3. 나머지는 주입받은 `confirmDeletion` 결과를 반환한다.

`promptDeletion`은 `@inquirer/prompts`를 동적 import하고 `confirm({ message, default: false })`만 담당한다.
새 외부 의존성을 추가하지 않는다.

### 2. 여섯 `delete.ts` — 옵션과 실행 경계 통일

다음 여섯 파일에 정확히 `.option("-y, --yes", "확인 없이 삭제 (자동화용)")`를 제공한다.

- `src/commands/wiki/page-delete.ts`
- `src/commands/wiki/page-file/delete.ts`
- `src/commands/wiki/page-comment/delete.ts`
- `src/commands/post/file/delete.ts`
- `src/commands/post/comment/delete.ts`
- `src/commands/post/comment/file/delete.ts`

각 action의 첫 부수 효과는 공통 확인이어야 한다.
`authorizeDeletion(!!opts.yes, !!process.stdin.isTTY, () => promptDeletion(<명령별 경고>))`을 `getConfigOrThrow`, `new DoorayApiClient`, 모든 resolver, spinner, API 호출보다 앞에 둔다.
프롬프트 문구는 resolver 결과나 API 응답에 의존하지 않고 삭제 대상 종류와 되돌릴 수 없는 영향을 설명한다.
기존 `wiki page delete`의 하위 페이지 재부착 경고와 `post comment file delete`의 본문 reference·부분 실패 경고는 보존한다.

확인 결과가 거짓이면 `process.stderr.write("취소되었습니다.\n")` 후 정상 반환한다.
plain·`--json`·`--quiet` stdout에는 취소 출력을 쓰지 않는다.
확인 결과가 참이면 각 명령의 기존 resolver, spinner, 삭제 API, 성공 출력 순서로 그대로 진행한다.

### 3. `src/utils/delete-confirmation.test.ts` — 공통 정책 단위 테스트

다음 분기를 고정한다.

- `skipConfirmation=true`이면 TTY 여부와 무관하게 `true`, 확인 함수 0회
- 플래그 없는 non-TTY이면 `EXIT_PARAM_ERROR`(3), 확인 함수 0회
- 플래그 없는 TTY이면 확인 함수 정확히 1회, 참·거짓 반환 보존
- `promptDeletion`이 `@inquirer/prompts`에 `default: false`를 전달
- 오류 메시지에 `--yes(-y)` 재실행 안내 포함

stdin이나 실제 프롬프트를 열지 말고 확인 함수를 주입하거나 모듈을 mock한다.

### 4. `src/commands/delete-confirmation-policy.test.ts` — 여섯 명령 경계 회귀 테스트

여섯 `Command` 객체를 표 기반으로 검증한다.

- 각 명령의 옵션 메타데이터에 short `-y`, long `--yes`가 모두 존재
- `-y`와 `--yes` 어느 쪽도 `opts.yes=true`로 공통 유틸리티에 전달
- 공통 유틸리티가 non-TTY 오류를 던지면 `getConfigOrThrow`, client 생성, resolver, 삭제 API가 모두 0회
- 공통 유틸리티가 `false`를 반환하면 stderr에 취소 1회, stdout·resolver·삭제 API가 모두 0회
- 공통 유틸리티가 `true`를 반환한 경로는 기존 명령별 삭제 흐름으로 진입

Commander 객체의 반복 parse가 테스트 상태를 누적하면 테스트 안에서 모듈을 격리하거나 명령별 한 번만 parse한다.
생산 코드에 테스트 전용 factory나 옵션을 추가하지 않는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/utils/delete-confirmation.ts` | 신규 — 확인·비TTY 정책 |
| `src/utils/delete-confirmation.test.ts` | 신규 — 정책 단위 테스트 |
| `src/commands/delete-confirmation-policy.test.ts` | 신규 — 여섯 명령 경계 테스트 |
| `src/commands/wiki/page-delete.ts` | 수정 — 공통 확인 경계 |
| `src/commands/wiki/page-file/delete.ts` | 수정 — 공통 확인 경계 |
| `src/commands/wiki/page-comment/delete.ts` | 수정 — 공통 확인 경계 |
| `src/commands/post/file/delete.ts` | 수정 — 공통 확인 경계 |
| `src/commands/post/comment/delete.ts` | 수정 — 공통 확인 경계 |
| `src/commands/post/comment/file/delete.ts` | 수정 — 공통 확인 경계 |

## 검증

```bash
# cwd: repository implementation worktree
git diff --check
pnpm exec vitest run src/utils/delete-confirmation.test.ts src/commands/delete-confirmation-policy.test.ts
pnpm exec tsc --noEmit
```

모든 명령의 종료 코드가 0이어야 하고, 정책 테스트는 여섯 명령을 모두 열거해야 한다.
실제 삭제 API는 파괴적이므로 호출하지 않는다.

## 의도 메모 (왜)

- 일부 명령만 먼저 바꾸면 같은 비일관성이 남으므로 여섯 명령을 한 phase에서 원자적으로 변경한다.
- 확인을 config·resolver보다 앞에 두어 non-TTY 무플래그 경로의 API 호출을 구조적으로 차단한다.
- 확인 정책과 프롬프트 I/O를 분리해 stdin mock에 의존하지 않는 단위 테스트를 유지한다.
- 최근 `origin/main`의 관련 변경은 문서·스킬 정리였고 여섯 삭제 명령 구현과 충돌하지 않았다. 실행 시 base가 달라졌다면 같은 경로의 최신 커밋을 다시 확인하고 계약 차이가 있으면 `PHASE_BLOCKED`로 보고한다.
