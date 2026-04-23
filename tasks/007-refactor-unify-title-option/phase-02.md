# Phase 2: skills/dooray-cli/SKILL.md 예시 갱신

## 컨텍스트

Phase 1에서 `post create/edit`의 `--title` 표준화가 완료됐다. `skills/dooray-cli/SKILL.md`는 AI agent가 참조하는 CLI 사용자 매뉴얼이므로, 실제 커맨드 변경과 동일한 논리 단위로 동시에 갱신해야 agent가 잘못된 예시를 학습하지 않는다.

### 먼저 읽을 파일

- `skills/dooray-cli/SKILL.md` 전체 — `--subject` 언급 여부 전수 확인
- `CLAUDE.md` 주의사항 섹션 — 정책 문구 참조 (이미 `f4ad1a0`에서 갱신됨)

### 이전 phase 상호작용

Phase 1 완료가 전제. post/create, post/edit 코드가 `--title`을 이미 받고 있어야 SKILL.md 예시와 일치.

### 갱신 대상 4곳 (작성 시점 기준 grep)

```
skills/dooray-cli/SKILL.md:57:| 업무 생성 | `dooray post create <project> --subject "..." --body "..."` |
skills/dooray-cli/SKILL.md:58:| 업무 제목/본문 수정 | `dooray post edit <project> <number> --subject "..." --body "..."` |
skills/dooray-cli/SKILL.md:129:  --subject "주간보고 2026-W14" \
skills/dooray-cli/SKILL.md:163:  --subject "제목" \
skills/dooray-cli/SKILL.md:173:dooray post create <project> --subject "제목" --body-file ./content.md
skills/dooray-cli/SKILL.md:180:dooray post edit <project> <number> --subject "새 제목"
skills/dooray-cli/SKILL.md:186:dooray post edit <project> <number> --subject "새 제목" --body-file ./updated.md
```

7개 라인에서 `--subject` 사용. 모두 `--title`로 교체.

**제외 대상**:
- `skills/dooray-cli/SKILL.md:73` — `dooray mail send --to "..." --subject "..."` → mail/send는 `--subject` 유지 (이메일 표준). **건드리지 말 것**

## 목표

1. `skills/dooray-cli/SKILL.md`의 post 관련 모든 `--subject` 예시를 `--title`로 교체
2. mail 예시는 그대로 유지
3. 빌드 영향 없음 (문서만)

## 작업 목록

### 1) 텍스트 교체

각 라인을 정확히 아래와 같이 변경:

| Before | After |
|---|---|
| `\| 업무 생성 \| \`dooray post create <project> --subject "..." --body "..."\` \|` | `\| 업무 생성 \| \`dooray post create <project> --title "..." --body "..."\` \|` |
| `\| 업무 제목/본문 수정 \| \`dooray post edit <project> <number> --subject "..." --body "..."\` \|` | `\| 업무 제목/본문 수정 \| \`dooray post edit <project> <number> --title "..." --body "..."\` \|` |
| `  --subject "주간보고 2026-W14" \` | `  --title "주간보고 2026-W14" \` |
| `  --subject "제목" \` | `  --title "제목" \` |
| `dooray post create <project> --subject "제목" --body-file ./content.md` | `dooray post create <project> --title "제목" --body-file ./content.md` |
| `dooray post edit <project> <number> --subject "새 제목"` | `dooray post edit <project> <number> --title "새 제목"` |
| `dooray post edit <project> <number> --subject "새 제목" --body-file ./updated.md` | `dooray post edit <project> <number> --title "새 제목" --body-file ./updated.md` |

**방식 제안**: Read로 전체 읽고, Edit로 각 라인 개별 치환. `--subject` 는 mail/send 라인에서도 등장하므로 `replace_all` 사용 금지 — 반드시 한 줄씩 충분한 컨텍스트와 함께 치환.

### 2) deprecation 정책 한 줄 추가 (선택)

SKILL.md 상단 "출력 모드" 근처 또는 "의도 → 커맨드 매핑" 표 아래 "---" 섹션에 한 줄 명시:

```markdown
> **제목 옵션 네이밍**: `post` 와 `wiki page` 모두 `--title` 표준. `post`의 `--subject`는 deprecated alias로 당분간 동작하되, 새 코드에서는 `--title` 사용을 권장.
```

**위치 추천**: "의도 → 커맨드 매핑" 표 바로 아래 `---` 라인 직전.

### 3) 정적 검증

```bash
# cwd: /Users/nhn/personal/dooray-cli

# post 관련 --subject 자취 없음 확인
grep -n "post create.*--subject\|post edit.*--subject" skills/dooray-cli/SKILL.md || echo "OK_CLEANED"

# --subject는 mail 라인에만 남아있음 (1곳)
grep -n "\-\-subject" skills/dooray-cli/SKILL.md

# --title 사용 증가 확인 (post create/edit + wiki page create + 새 deprecation 문구)
grep -c "\-\-title" skills/dooray-cli/SKILL.md

# deprecation 문구 추가 확인 (선택 작업 완료 여부)
grep -n "deprecated alias" skills/dooray-cli/SKILL.md || echo "NOTE: 정책 문구 미추가"
```

## 성공 기준

- [ ] `grep "post create.*--subject\|post edit.*--subject" skills/dooray-cli/SKILL.md` → 매치 없음
- [ ] `grep "\-\-subject" skills/dooray-cli/SKILL.md` → 1줄 (mail/send 예시만 남음)
- [ ] `grep -c "\-\-title" skills/dooray-cli/SKILL.md` → 4 이상 (post create + post edit + wiki page create 표 + 사용 예 + 선택으로 추가한 정책 문구)
- [ ] `git diff --stat skills/` → 1 파일 수정
- [ ] `pnpm run build` 성공 (문서 변경이지만 회귀 확인)

## 주의사항

- **mail/send 라인의 `--subject`는 절대 건드리지 말 것** — 이메일 표준 용어
- `replace_all`로 `--subject` → `--title` 전역 치환 금지 — mail 라인 오염
- 한글 큰따옴표(`"`)가 아닌 ASCII (`"`) 그대로 유지 (기존 파일 스타일 일관)
- 선택 작업(정책 문구)이 번거로우면 skip 가능하지만, AI agent에게 "왜 두 이름이 있는가" 알려주는 가치가 있으므로 **포함 추천**

## Blocked 조건

- `skills/dooray-cli/SKILL.md` 파일이 사라졌거나 이동됨 → `PHASE_BLOCKED: 스킬 매뉴얼 경로 변경`
- 위 grep으로 찾은 7개 라인 중 하나라도 구조가 크게 달라 단순 치환 실패 → `PHASE_BLOCKED: SKILL.md 구조 변경 감지`
