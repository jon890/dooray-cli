# Phase 02. 호출 지점과 CI 를 새 스크립트로 돌린다

**Execution profile**: standard

## 목표

phase 01 이 만든 `.mjs` 를 부르도록 호출 지점 전부와 CI 를 고친다.
phase 01 이 끝난 시점에는 CI 가 깨진 상태이므로 이 phase 가 그것을 닫는다.

**범위 외**: 검사 규칙과 화이트리스트를 바꾸지 않는다.
완료된 `tasks/` 의 phase 파일은 고치지 않는다. 그 이유는 아래 컨텍스트에 있다.

## 컨텍스트

**근거 문서**: `docs/adr/048-checks-to-mjs.md`.

고칠 호출 지점은 저장소 안 7개 파일 14줄이다.

| 파일 | 줄 |
| --- | --- |
| `CLAUDE.md` | 65, 86, 108 |
| `.claude/build-with-teams-overlay.md` | 35 |
| `.claude/planning-overlay.md` | 51, 60 |
| `.claude/agents/dooray-cli-executor.md` | 69 |
| `.claude/agents/dooray-cli-docs-verifier.md` | 30, 170 |
| `.claude/skills/release/SKILL.md` | 97, 98 |
| `.github/workflows/ci.yml` | 33, 36 |

줄 번호는 이 plan 을 쓴 시점의 값이다. 실제 위치는 grep 으로 다시 확인한다.

```bash
# cwd: <repo root>
grep -rn "check-pii\.sh\|check-public-refs\.sh" CLAUDE.md .claude/ .github/
```

`worktrees/` 아래는 다른 브랜치의 사본이라 대상이 아니다. 건드리지 않는다.

**완료된 `tasks/` 의 phase 파일은 고치지 않는다.**
완료된 plan 은 교정 대상이 아니라 제거 대상이고, 그 판정은 `harness-cleanup` 이 소유한다.
지금 진행 중인 다른 plan 의 phase 파일도 고치지 않는다.
그 plan 들이 각자 브랜치에 있어 여기서 고치면 머지에서 부딪힌다.
그 파일들이 낡은 명령을 담게 되지만, 실행 시점에 `node scripts/check-pii.mjs` 로 바꿔 부르면 된다.
그 사실을 보고에 적는다.

`.github/workflows/ci.yml` 의 검사 스텝 앞에 이런 주석이 있다.

```
# 의존성 설치 전에 돈다. 문서 검사는 Node 가 필요 없고,
# 공개 저장소라 식별자 노출은 한 번 새면 되돌리기 어렵다.
```

`.mjs` 로 바뀌면 「Node 가 필요 없고」가 사실과 달라진다.
`actions/setup-node` 가 검사 스텝보다 앞에 있어 Node 는 이미 있다. 그 사실로 주석을 고친다.

## 의도 메모

- CI 의 스텝 순서를 바꾸지 않는다. 검사가 `pnpm install` 앞에 있는 이유는
  공개 저장소에서 식별자 노출이 한 번 새면 되돌리기 어렵다는 것이고 런타임과 무관하다.
- `bash` 접두를 `node` 로 바꾼다. `pnpm check:pii` 로 바꾸지 않는다.
  `pnpm` 은 `pnpm install` 앞에서도 돌지만, 검사가 패키지 매니저에 의존할 이유가 없다.
  `node` 로 직접 부르면 의존이 하나 줄어든다.
- `package.json` 의 `check:pii` 와 `check:refs` 는 사람이 손으로 돌릴 때를 위해 남긴다.
- `CLAUDE.md:65` 는 검사 범위의 소유자를 가리키는 문장이다. 경로만 바꾸고 문장 구조는 그대로 둔다.

## 작업 항목

### 1. `.github/workflows/ci.yml` 의 두 스텝을 고친다

- `run: bash scripts/check-pii.sh` 를 `run: node scripts/check-pii.mjs` 로 바꾼다.
- `run: bash scripts/check-public-refs.sh` 를 `run: node scripts/check-public-refs.mjs` 로 바꾼다.

스텝 이름과 순서는 바꾸지 않는다.

그 앞 주석을 고친다. 「문서 검사는 Node 가 필요 없고」를 지우고,
`setup-node` 가 앞에 있어 Node 는 이미 준비돼 있으며 의존성 설치만 앞으로 남긴다는 뜻으로 쓴다.
식별자 노출이 되돌리기 어렵다는 문장은 그대로 둔다.

### 2. `CLAUDE.md` 의 세 줄을 고친다

- 검사 범위의 소유자를 가리키는 문장에서 `scripts/check-pii.sh` 를 `scripts/check-pii.mjs` 로 바꾼다.
- 검증 명령 블록의 `bash scripts/check-pii.sh` 를 `node scripts/check-pii.mjs` 로 바꾼다.
- 검증 명령 블록의 `bash scripts/check-public-refs.sh` 를 `node scripts/check-public-refs.mjs` 로 바꾼다.

「가상 예시를 새로 쓰려면 스크립트의 `OK_PROJECTS` 나 `OK_DOMAINS` 에 먼저 추가한다」 문장은 그대로 둔다.
새 파일이 같은 이름의 상수를 갖는다.

### 3. `.claude/` 아래 다섯 파일의 호출을 고친다

`.claude/build-with-teams-overlay.md`, `.claude/planning-overlay.md`,
`.claude/agents/dooray-cli-executor.md`, `.claude/agents/dooray-cli-docs-verifier.md`,
`.claude/skills/release/SKILL.md` 다.

`bash scripts/check-pii.sh` 를 `node scripts/check-pii.mjs` 로,
`bash scripts/check-public-refs.sh` 를 `node scripts/check-public-refs.mjs` 로 바꾼다.
경로만 언급하는 문장은 확장자만 바꾼다.

일괄 치환을 쓸 때 정책 문서가 금지어나 옛 경로를 예시로 인용한 자리가 있는지 먼저 본다.
치환 대상과 치환 정의가 같은 텍스트일 때 일괄 치환은 정의 자체를 깨뜨린다.

```bash
# cwd: <repo root>
grep -rn "check-pii" CLAUDE.md .claude/ | grep -v "\.mjs"
```

치환 뒤 이 grep 이 아무 줄도 내지 않아야 한다.

### 4. `docs/adr/INDEX.md` 에 ADR-048 을 등재한다

한 줄을 append 한다. 기존 줄을 고치지 않는다.
동시에 도는 다른 planning 과 같은 줄을 건드리지 않기 위해서다.

### 5. `docs/code-architecture.md` 의 기술 스택 절에 한 줄을 더한다

검사 스크립트가 `node:` 빌트인만 쓰는 `.mjs` 이고, CI 의 의존성 설치 앞에서 돌기 때문이라는 것을 적는다.
ADR-048 을 가리킨다. 내부 문서이므로 ADR 번호를 써도 된다.

### 6. 전체 검사를 이 phase 의 테스트로 돌린다

이 phase 는 호출 지점만 고치므로, 새 경로로 검사가 실제로 도는 것이 완료 판정이다.

```bash
# cwd: <repo root>
node scripts/check-pii.mjs; echo $?            # = 0
node scripts/check-public-refs.mjs; echo $?    # = 0
pnpm check:pii; echo $?                        # = 0
pnpm check:refs; echo $?                       # = 0
pnpm vitest run scripts/check-pii.test.mjs scripts/check-public-refs.test.mjs
```

앞 넷이 모두 0 이고 마지막이 통과해야 한다.

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm run build
pnpm test
```

셋 다 통과해야 한다.

낡은 호출이 남지 않았는지 확인한다.

```bash
# cwd: <repo root>
grep -rc "check-pii\.sh" CLAUDE.md .claude/ .github/ docs/           # 각각 = 0
grep -rc "check-public-refs\.sh" CLAUDE.md .claude/ .github/ docs/   # 각각 = 0
grep -c "check-pii.mjs" .github/workflows/ci.yml                     # = 1
grep -c "check-public-refs.mjs" .github/workflows/ci.yml             # = 1
grep -c "Node 가 필요 없고" .github/workflows/ci.yml                  # = 0
grep -c "ADR-048" docs/adr/INDEX.md                                  # = 1
```

여섯 기대값이 모두 맞아야 한다.
다섯 번째가 0 인 것은 사실과 달라진 주석을 고쳤다는 근거다.

CI 순서가 유지됐는지 확인한다.

```bash
# cwd: <repo root>
grep -n "setup-node\|check-pii.mjs\|pnpm install" .github/workflows/ci.yml
```

`setup-node` 의 줄 번호가 `check-pii.mjs` 보다 작고, `check-pii.mjs` 가 `pnpm install` 보다 작아야 한다.
순서가 바뀌면 검사가 Node 없이 실행되거나 설치 뒤로 밀린다.

## plan 완료 마킹

이 plan 의 마지막 phase 다. 위 검증을 모두 통과시킨 뒤 `index.json` 을 고치고,
**이 phase 의 단일 commit 에 그 변경을 함께 넣는다.** 별도 commit 이나 amend 로 미루지 않는다.

```bash
# cwd: <repo root>
PLAN=tasks/plan062-chore-checks-to-mjs
sed -i '' 's/"status": "pending"/"status": "completed"/g' $PLAN/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 2/' $PLAN/index.json
grep -c '"status": "completed"' $PLAN/index.json     # = 3 (최상위 1 + phase 2)
grep -c '"current_phase": 2' $PLAN/index.json        # = 1
```

두 기대값이 맞아야 한다. `phases` 배열 항목에 `status` 키가 없으면 먼저 각 항목에 넣는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `.github/workflows/ci.yml` | 수정 |
| `CLAUDE.md` | 수정 |
| `.claude/build-with-teams-overlay.md` | 수정 |
| `.claude/planning-overlay.md` | 수정 |
| `.claude/agents/dooray-cli-executor.md` | 수정 |
| `.claude/agents/dooray-cli-docs-verifier.md` | 수정 |
| `.claude/skills/release/SKILL.md` | 수정 |
| `docs/adr/INDEX.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `tasks/plan062-chore-checks-to-mjs/index.json` | 수정 |
