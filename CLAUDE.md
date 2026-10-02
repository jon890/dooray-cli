# dooray-cli 프로젝트 지침

## 프로젝트 개요

NHN Dooray REST API CLI 도구. TypeScript 와 Commander.js 기반.

## API 스펙 확인 절차

신규 endpoint 를 사용하거나 API 동작을 검증할 때는 아래 절차를 반드시 따른다.

Dooray 공식 API 문서: [https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419](https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2939987647631384419)

공개 페이지지만 React 앱이라 `WebFetch` 로는 본문을 못 읽는다.
`~/.claude/scripts/browser-driver` 로 열어 endpoint 와 request·response 스키마, 동작 특이점을 확인한 뒤 코드를 작성한다.
명령 목록과 유의할 점은 `browser-driver help` 의 출력이 소유한다.

문서에 없거나 직관에 반하는 동작은 ADR 로 보존한다. 영역별 ADR 은 `docs/adr/INDEX.md` 에서 찾는다.

저장소의 ADR 과 이 파일과 스킬 문서와 코드 주석에 적힌 API 서술은 근거가 아니라 그때의 확인 결과다.
그 서술과 공식 문서가 어긋나면 공식 문서를 따르고 저장소 서술을 고친다. 자세한 내용은
[ADR-046](docs/adr/046-official-api-doc-precedence.md)을 참고한다.

구현된 endpoint 와 공식 목록을 대조하려면 `pnpm api:inventory` 를 돌린다.

「구현에 있고 공식에 없는 것」 이 0건이 아니면 공식 문서를 열어 비공식 경로인지 스냅샷이 낡은 것인지 확인한다.
스냅샷이 낡았으면 `docs/api/official-endpoints.txt` 를 갱신하고, 비공식 경로인데 쓰기로 정했으면
그 스크립트의 `KNOWN_UNDOCUMENTED` 로 옮긴다.

**공식 문서에 없는 endpoint 는 기본으로 쓰지 않는다.** 쓰려면 읽기 전용이어야 하고
확인·실측·등록·경고 네 가지를 모두 채워야 한다. 조건과 그 이유는
[ADR-062](docs/adr/062-undocumented-endpoint-policy.md)가 소유한다.

## 빌드 & 실행

```bash
pnpm install          # 의존성 설치
pnpm run build        # tsup 빌드 (dist/index.js 단일 번들)
pnpm tsc --noEmit     # 타입 체크 전용 (런타임 번들에는 미사용)
node dist/index.js    # 직접 실행
dooray                # 글로벌 링크 시
```

새 의존성을 추가하면 `package.json` 의 `exports` 맵 진입점이 의도와 맞는지 확인한다.
`moduleResolution: "Bundler"` 는 Node16 보다 exports 검증이 느슨해 잘못된 진입점이 조용히 통과한다.

## 디렉토리 구조

`docs/code-architecture.md` 가 디렉터리 책임, 레이어, 의존 방향을 담는 단일 소스다.
파일 하나하나가 무엇을 하는지는 그 파일의 머리말 주석이, 왜 그런지는 ADR 이 소유한다.
새 파일을 더할 때 그 문서에 줄을 더하지 않는다.

## 코드 컨벤션

- HTTP 클라이언트: `ky` 
- 빌드: `tsup` (CJS 단일 번들, shebang 포함)
- 패키지 매니저: `pnpm`
- 캐시: `~/.dooray/cache/` 에 파일별 분리 — 구조와 TTL 은 `docs/data-schema.md`
- config: `~/.dooray/config.json` (env var 폴백 없음)
- 에러: `DoorayCliError(message, exitCode)` 로 통일
- 출력: 데이터는 stdout, 스피너/에러는 stderr

## 명령 공통 규약

명령별 옵션·동작은 `docs/adr/INDEX.md` 와 `README.md` 에서 찾는다. 여기에는 전 명령 공통 규약만 둔다.

- **입력 형식** — post get/edit/replace/done/workflow 와 post comment·post file 계열, wiki page get/edit/replace/delete/move 와 wiki page file·comment 계열이 공통으로 받는다. `post list`·`post search`·`post create` 는 받지 않는다
  - `<project> <number>` / `--id <id>` / `--url <url>` / 첫 positional 에 Dooray URL 직접 입력
  - wiki 의 `--id` 모드는 project 없이 단독으로 동작한다. `--project` 는 선택이며 주면 wikiId 해석 호출을 아낀다
- **옵션 이름**
  - 제목은 post·wiki 모두 `--title` 이다. `post list` 의 `--subject` 는 제목 키워드 필터다. `post create`·`post edit` 는 `--subject` alias 를 받지 않는다
  - 본문은 `--body` / `--body-file` (둘 다 `-` 로 stdin 을 받는다)
  - `config set <key> <value>` 의 값도 `-` 로 stdin 을 받는다 — 토큰이 셸 기록과 프로세스 목록에 남지 않게 하는 경로다
  - `post edit`, `wiki page edit`, `post`·`wiki page` 의 `comment add`/`edit`, `messenger send`·`channel-send`·`thread-send` 는 둘 다 없으면 `$EDITOR` 가 열린다. 단 `post edit` 의 태그·참조자·담당자 변경 옵션과 `post edit`·`wiki page edit`·`post comment edit` 의 `--mime-type` 은 제목·본문 없이도 비대화형 수정으로 실행한다. `post edit` 은 `--mention`·`--mention-group`·`--link-task`·`--parent`·`--dry-run` 도 편집기를 열지 않는다. `--dry-run` 은 합성한 본문만 출력한다. `create` 계열은 `$EDITOR` 폴백이 없고, 둘 다 없으면 에러 대신 빈 본문으로 생성한다. `post create` 는 `--template` 을 주면 그 템플릿 본문을 채운다
- **mail 계열 입력**: `mail get`·`mail reply` 는 IMAP UID 외에 메일 웹 주소와 그 주소의 mail id 도 받는다. mail id 는 도착 시각으로 풀어 UID 를 찾는다 (ADR-040)
  - 세 입력 형식 모두 답장 발송 전에 원본을 보여주고 확인을 거친다. 확인 절차와 종료 코드 규약은 ADR-060 이 소유한다
- **resolver 매칭**: 정확일치 → 이름 부분일치 → 모호하면 에러와 후보 목록 출력
- **출력**: `--json` 은 raw 유지, `--quiet` 은 식별자만
  - 보강한 값이 필요하면 그것을 명시하는 옵션을 둔다. `post get --with-tag-names` 가 그 형태다.
    옵션을 주지 않은 호출의 출력은 달라지지 않는다 (ADR-056)
- **파괴적 삭제 명령**: 확인을 기본으로 하고 `-y`/`--yes` 로 생략한다 (ADR-036)
  - TTY 확인의 기본값은 아니오다. 사용자가 거절하면 API를 호출하지 않고 정상 취소한다
  - non-TTY에서 `-y`/`--yes`가 없으면 설정 조회·resolver·API 호출 전에 `EXIT_PARAM_ERROR`(3)로 중단한다
- **post 목록 정렬**: 기본은 최신순 (`-createdAt`). `post list` 만 `--order` 로 바꿀 수 있다
- **무시되는 옵션**: 다른 옵션 때문에 효력이 없어진 옵션은 무시하고 stderr 로 경고한다

## 개인 식별 정보 / 사내 식별자 노출 금지 (public OSS)

아래 식별자는 git 추적 대상 어디에도 넣지 않는다. 테스트 fixture, 에러 메시지 예시, 이슈 본문도 포함한다.
구체적인 사내 식별자는 이 파일에도 적지 않는다. CLAUDE.md 자체가 public 이라 나열이 곧 노출이다.

| 노출 금지 | 대체 |
| --- | --- |
| 사내 Dooray 프로젝트 코드 | `<project>` |
| 사내 NHN 도메인 | `<tenant>` / `example.com` |
| 사내 이메일 | `user@example.com` |
| 실제 19자리 numeric ID (postId/pageId/memberId/projectId/groupId) | `<postId>` / `<pageId>` / `<memberId>` 등 |
| 실명 (사용자 본인, 동료 한국어 이름) | `<사용자A>` 또는 가상 이름(`홍길동`/`김철수`) |
| Dooray orgId (실제 19자리) | `<orgId>` |

커밋, 이슈 작성, 릴리스 전에 `node scripts/check-pii.mjs` 를 돌린다. CI 가 같은 스크립트로 PR 을 막는다.
검사 범위와 화이트리스트, 종료 코드는 그 스크립트가 소유한다.
가상 예시를 새로 쓰려면 스크립트의 `OK_PROJECTS` 나 `OK_DOMAINS` 에 먼저 추가한다.

## 경로별 규칙

특정 경로를 다룰 때만 필요한 규칙은 `.claude/rules/` 에 두고 frontmatter 의 `paths` 로 범위를 정한다.
Claude Code 는 그 경로의 파일을 읽을 때 규칙을 불러온다.

| 파일 | 범위 |
| --- | --- |
| `.claude/rules/public-docs.md` | `README.md`, `skills/**` 의 내부 참조 번호 제외 |
| `.claude/rules/skill-authoring.md` | `.claude/skills/**` 의 스킬 작성 규약 |

## Git

커밋 메시지와 PR 제목·본문은 한국어로 작성한다.
