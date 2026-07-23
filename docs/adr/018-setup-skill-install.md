## ADR-018: `dooray setup` 에서 Claude Code 스킬 설치

**상태**: ADR-035로 대체됨.

**결정**: setup 마지막 단계에서 스킬 설치 여부를 물어보고 심볼릭 링크로 설치 (`~/.claude/skills/dooray-cli` → 패키지 내부 `skills/dooray-cli/`).
idempotent 재실행 가능.
npx 임시 경로 감지 시 경고 + skip (global install 전용).

**맥락**: 별도 `dooray install skills` 커맨드보다 setup 일원화가 UX 간결.
심볼릭 링크는 `npm update -g` 시 스킬도 자동 최신화 (유지보수 비용 0).
`~/.claude/skills/` 의 다른 스킬 (gstack 등) 도 동일 패턴이라 일관성.
스킬 포맷은 Claude Code SKILL.md frontmatter 규격 — 타 에이전트 지원은 요청 시 확장.

**대안 기각**:
- `postinstall` 훅 — npm 정책상 interactive postinstall 비권장, CI/Docker 비-TTY 실패 (ADR-016 과 동일 사유)
- 파일 복사 — `npm update` 시 자동 최신화 안 됨, 사용자가 재설치 명령 알아야

세부 (origin 경로 / doctor 검증 / package.json `files` 필드) 는 `src/commands/setup.ts` + `src/commands/doctor.ts` 참조.
