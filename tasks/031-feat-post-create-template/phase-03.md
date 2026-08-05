# Phase 03 — README + skills/dooray-cli/SKILL.md + 완료 마킹

## 변경 파일

```bash
# cwd: /Users/nhn/personal/dooray-cli
git diff <base>..HEAD --name-only -- README.md skills/ tasks/031-feat-post-create-template/
```

기대 결과 (총 3 파일):
```
README.md
skills/dooray-cli/SKILL.md
tasks/031-feat-post-create-template/index.json
```

## 작업 항목

### 1. `README.md` — 사용 예 추가

기존 post 명령 섹션 옆에 템플릿 사용 예 + project templates 사용 예:

```markdown
#### 템플릿 기반 정형 task (ADR-027)

\`\`\`bash
# 프로젝트의 템플릿 목록
dooray project templates <project>

# 템플릿으로 업무 생성 (body/users/tags 자동 채움)
dooray post create <project> --template "릴리스 플랜"

# 사용자 옵션 override — 일부 필드만 다르게
dooray post create <project> --template "릴리스 플랜" --title "v0.9 릴리스 계획" --tag "p0"

# 19자리 templateId 직접 입력
dooray post create <project> --template 1234567890123456789 --title "by id"
\`\`\`

`interpolation=true` 가 기본 — Dooray 가 `${year}`, `${month}` 같은 시스템 매크로를 응답에서 자동 치환. 사용자 정의 변수 (`--field key=value`) 는 본 release scope 외 (별도 후속).
```

### 2. `skills/dooray-cli/SKILL.md` — 자동화 시나리오

빠른 참조 표에 행 추가:

```markdown
| `dooray project templates <project>` | 프로젝트 템플릿 목록 (id/templateName) |
| `dooray post create <project> --template <name|id>` | 템플릿 기반 정형 task 생성 (ADR-027) |
```

자동화 시나리오:

```markdown
## 정형 task 자동화 (Issue #59 / ADR-027)

매주 같은 형식의 task 를 만드는 자동화는 템플릿 + override 패턴이 효율적:

\`\`\`bash
# 매주 월요일 실행되는 cron — "주간 릴리스 체크" 템플릿으로 자동 생성
TODAY=$(date +%Y-%m-%d)
POST_ID=$(dooray post create <project> \
  --template "주간 릴리스 체크" \
  --title "주간 릴리스 체크 — $TODAY" \
  --json | jq -r '.id')
\`\`\`

템플릿 본문의 `${year}` / `${month}` 등 매크로는 Dooray 가 자동 치환 (`interpolation=true` 기본). 사용자 정의 변수는 미지원 — 필요 시 client 측 string replace 로 처리.
```

### 3. 마지막 phase — index.json 완료 마킹

```bash
# cwd: /Users/nhn/personal/dooray-cli
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/031-feat-post-create-template/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 3/' tasks/031-feat-post-create-template/index.json
grep -c '"status": "completed"' tasks/031-feat-post-create-template/index.json
# 기대: 4 (index + 3 phases)
grep -cE "\"current_phase\": 3" tasks/031-feat-post-create-template/index.json
# 기대: 1
```

## 성공 기준

```bash
# cwd: /Users/nhn/personal/dooray-cli

# 1. 빌드 + 테스트 통과
pnpm tsc --noEmit 2>&1 | grep -cE "^src/"
# 기대: 0
pnpm build && pnpm test
# 기대: exit 0

# 2. README / SKILL.md 에 신규 명령 + 옵션
grep -cE "project templates|post create.*--template" README.md skills/dooray-cli/SKILL.md
# 기대: 4 이상

# 3. ADR-027 역참조
grep -nE "ADR-027" README.md skills/dooray-cli/SKILL.md
# 기대: 1 이상

# 4. index.json 완료 마킹
grep -c '"status": "completed"' tasks/031-feat-post-create-template/index.json
# 기대: 4
grep -cE "\"current_phase\": 3" tasks/031-feat-post-create-template/index.json
# 기대: 1

# 5. 개인 식별 정보 0건 (CLAUDE.md full pattern 동기화)
grep -rnE "<사내 식별자 패턴 — CLAUDE.md 참조>|kim@example\.com" README.md skills/ tasks/031-feat-post-create-template/ 2>/dev/null | grep -vE "사내 Dooray|NHN 도메인|grep -rnE"
# 기대: 0건 (exit 1)
```

## 작업 외 금지

- 코드 변경 금지 (phase-01/02 결과 그대로)
- planning docs (CLAUDE.md / adr.md / code-architecture.md / prd.md / flow.md / data-schema.md) 변경 금지 — commit `8603e64` 으로 반영됨
- `--field` / `--interpolation` 등 ADR-027 미정의 옵션 안내 금지

## 커밋

```bash
# cwd: /Users/nhn/personal/dooray-cli
# branch: feat/031-feat-post-create-template
git add README.md skills/dooray-cli/SKILL.md tasks/031-feat-post-create-template/index.json
git commit -m "docs: document templates feature; complete task 031

Issue #59 (phase 3/3, ADR-027): README 사용 예 + SKILL.md 자동화 시나리오
(주간 정형 task 자동 생성). 완료 마킹."
```
