# Phase 3: 빌드 + smoke 검증

## 컨텍스트

Phase 1-2 결과를 기계적으로 검증. 코드 변경 없음.

### 먼저 읽을 파일

- `tasks/007-refactor-unify-title-option/index.json` — 이전 phase status 확인용

## 목표

1. `pnpm run build` 통과
2. `post create --help` / `post edit --help` smoke: `--title`, `--subject` 둘 다 노출
3. `post list --help` / `mail send --help` 회귀 확인: `--subject` 그대로
4. `wiki page create --help` 회귀: `--title` 그대로

## 작업 목록

### 1) 빌드

```bash
# cwd: /Users/nhn/personal/dooray-cli
pnpm run build
```

### 2) `post create --help`

```bash
# cwd: /Users/nhn/personal/dooray-cli
node dist/index.js post create --help
```

기대: `--title`과 `--subject` 두 옵션 모두 help 출력에 존재, `--subject`는 "deprecated alias" 설명이 보여야 함.

```bash
node dist/index.js post create --help 2>&1 | grep -E "\-\-title|\-\-subject"
```

### 3) `post edit --help`

```bash
node dist/index.js post edit --help 2>&1 | grep -E "\-\-title|\-\-subject"
```

### 4) 회귀: `post list --help`

```bash
node dist/index.js post list --help 2>&1 | grep -E "\-\-subject"
```

기대: `--subject <keyword>` 한 줄 (필터 키워드 설명 유지).

### 5) 회귀: `mail send --help`

```bash
node dist/index.js mail send --help 2>&1 | grep -E "\-\-subject"
```

기대: 이메일 제목 설명 유지.

### 6) 회귀: `wiki page create --help`

```bash
node dist/index.js wiki page create --help 2>&1 | grep -E "\-\-title"
```

기대: `--title` 옵션 유지.

### 7) 필수 옵션 누락 에러 smoke

```bash
# post create: --title도 --subject도 없으면 "--title이 필요합니다." 에러
node dist/index.js post create testproj 2>&1 | grep -E "title|필요"
# 기대: 에러 메시지 출력 + exit != 0
```

### 8) 번들 크기 회귀 (허용 범위)

```bash
ls -la dist/index.js
# 이전 빌드 대비 크기 증가가 수 KB 이하여야 정상 (정책 문자열·옵션 추가 정도)
```

## 성공 기준

- [ ] `pnpm run build` 성공 (exit 0)
- [ ] `post create --help` 출력에 `--title` + `--subject` 둘 다 존재
- [ ] `post edit --help` 출력에 `--title` + `--subject` 둘 다 존재
- [ ] `post list --help` 출력에 `--subject` 존재 (필터 키워드 유지)
- [ ] `mail send --help` 출력에 `--subject` 존재 (이메일 제목 유지)
- [ ] `wiki page create --help` 출력에 `--title` 존재
- [ ] `node dist/index.js post create testproj` exit != 0 + 에러 메시지 "title" 또는 "필요" 포함
- [ ] `git status --short` → 이 phase에서는 코드 수정 없음

## 주의사항

- **이 phase는 코드 변경 금지** — 검증 실패 시 이전 phase 재개 (`--from-phase N`)
- smoke 검증은 `--help` 위주 — 실제 API 호출은 API 키 필요하므로 생략
- 에러 smoke(post create 인자 누락)에서 `process.exit(N)` 때문에 쉘 non-zero 반환됨 — `grep -E` 가 매치되면 테스트 통과

## Blocked 조건

- `pnpm run build` 실패 → `PHASE_BLOCKED: 빌드 실패 (phase 1 재점검)`
- `post create --help` 또는 `post edit --help` 에서 `--title` 누락 → `PHASE_BLOCKED: phase 1 옵션 누락`
- `post list --help` 또는 `mail send --help` 에서 `--subject` 누락 → `PHASE_BLOCKED: 의도치 않은 회귀`
