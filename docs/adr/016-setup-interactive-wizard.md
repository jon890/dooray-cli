## ADR-016: `dooray setup` 대화형 초기 설정 마법사

**결정**: `dooray setup` 커맨드로 대화형 초기 설정 마법사 제공.
`postinstall` 훅 대신 명시적 커맨드 방식 채택.

**이유**:

- `postinstall`은 CI/Docker 등 non-TTY 환경에서 실패, npm 정책상 interactive postinstall 비권장
- `dooray setup`은 언제든 재실행 가능, config 미설정 시 안내 메시지로 유도
- 재실행 시 기존 설정값을 기본값으로 표시하여 부분 수정 가능

**플로우**: 세부 단계는 `docs/flow.md` "최초 설정 — `dooray setup`" 섹션 참조.

**라이브러리**: `@inquirer/prompts` — 선택(select), 입력(input), 비밀번호(password), 확인(confirm) 프롬프트 지원. tsup CJS 번들 호환성 확인 필요.

**안전성**: Ctrl+C 시 config 파일 미저장 (부분 저장 방지).
모든 입력을 메모리에 수집한 뒤 마지막에 한 번만 writeFile.

**config 미설정 시 안내**: 기존 에러 메시지를 `dooray setup` 실행 유도로 변경.
