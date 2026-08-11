## ADR-022: `dooray feedback` 명령 — GitHub 호출은 `gh` CLI 에 위임

**결정**: GitHub issue 생성은 `gh` CLI 위임 (`execFile('gh', ['issue', 'create', ...])`).
본문 자동 메타는 환경 정보만 (`process.version`, `platform`, `arch`, `package.json` 버전) — config 객체에 접근 안 함.
`apiKey`, IMAP 비밀번호, `baseUrl` 모두 노출 0.
대상 repo 하드코딩 (`jon890/dooray-cli`).

**맥락**: 피드백 루프 마찰 제거 (Issue #19) — "에러 만남 → 한 줄로 issue 등록 → 작업 복귀".
gh CLI 위임은 토큰 관리·OAuth 앱 등록 부담을 0 으로.
dooray-cli 의 보안 표면도 늘지 않음.
baseUrl 노출 시 사내 endpoint 사용자가 OSS public repo 로 보낼 때 회사 정보 누출 위험.

**대안 기각**:
- PAT 를 config.json 에 저장 — 토큰 만료/회수/스코프 관리 부담, UX 약함
- OAuth Device Flow, 직접 토큰 — 매끄러우나 앱 등록·보관 코드 ↑, 가치 대비 과함
- octokit SDK — 외부 dep 추가, gh 위임이면 0
- baseUrl host 마스킹 — suffix 로 회사 식별 가능, 누출 0 인 "제외" 가 단순·안전

세부 옵션 (`--title` / `--body-file` / `--label` / `--dry-run`) 동작은 `src/commands/feedback.ts` 참조.
