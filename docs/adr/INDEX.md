# Architecture Decision Records

각 ADR 은 결정의 무엇·왜·대안 기각만 담는다.
구현 세부는 코드에 있다.
자명한 사항은 기록하지 않는다.

ADR 작성 전 [`planning` 오버레이의 ADR 작성 전 점검](../../.claude/planning-overlay.md) 통과를 확인한다.

ADR-NNN 내용은 `docs/adr/NNN-*.md` (번호 glob) 또는 아래 목록 링크로 찾는다.

아래 목록이 영역별 라우터다.

---

- [ADR-001](001-typescript-node.md) — TypeScript (Node.js) 선택
- [ADR-002](002-ky-http-client.md) — ky (HTTP 클라이언트)
- [ADR-004](004-disk-cache.md) — 디스크 캐시 (project·member·workflow)
- [ADR-005](005-postnumber-identifier.md) — postNumber 를 Post 식별자로 사용
- [ADR-006](006-editor-edit-flow.md) — $EDITOR 기반 수정 플로우
- [ADR-007](007-config-file-only.md) — config 파일 전용 (env var 폴백 없음)
- [ADR-008](008-member-ambiguity-error-candidates.md) — 멤버 모호성: 에러와 후보 출력
- [ADR-010](010-cache-file-split.md) — 캐시 파일 분리 (디렉토리 기반)
- [ADR-012](012-imap-mail.md) — IMAP 메일 연동
- [ADR-013](013-smtp-mail.md) — SMTP 메일 발송
- [ADR-014](014-ts-path-alias-deferred.md) — TypeScript Path Alias 보류
- [ADR-015](015-file-attachment-307-redirect.md) — 파일 첨부 API 307 리다이렉트 수동 처리
- [ADR-016](016-setup-interactive-wizard.md) — `dooray setup` 대화형 초기 설정 마법사
- [ADR-017](017-api-types-single-file.md) — `api/types.ts` 단일 파일 유지
- [ADR-018](018-setup-skill-install.md) — `dooray setup` 에서 Claude Code 스킬 설치
- [ADR-019](019-post-create-metadata-options.md) — `post create` 메타데이터 옵션 (`--tag`/`--parent`/`--workflow`/`--milestone`)
- [ADR-020](020-post-input-unification-vitest.md) — post 명령 input 통합 (`--id`/URL/positional)과 첫 테스트 인프라 (vitest)
- [ADR-021](021-member-command-creator-enrich.md) — `member` 명령과 `comment list` Creator 이름 자동 채우기
- [ADR-022](022-feedback-gh-cli.md) — `dooray feedback` 명령과 GitHub 호출의 `gh` CLI 위임
- [ADR-023](023-feedback-last-run-tracking.md) — `dooray feedback --last` last-run 추적 (opt-in, 에러시만, 최소 세트, argv 패턴 마스킹)
- [ADR-024](024-comment-file-synthesis.md) — `dooray post comment file *` (post-level files API와 댓글 PUT 합성)
- [ADR-025](025-post-cc-to-member-group.md) — `post edit/create` cc/to 에 member-group 추가 (full payload PUT과 `type: "group"`)
- [ADR-026](026-wiki-api-pitfalls.md) — Wiki API 호출 패턴 함정 (`parentPageId` 필수, `subject`/`title` 네이밍, 페이지 수정 3종 endpoint)
- [ADR-027](027-post-create-template.md) — `post create --template` 정책 (interpolation 기본 true, 사용자 옵션 우선 override, `--field` 사용자 변수 제외)
- [ADR-028](028-member-group-response-shape.md) — member-group 응답 shape — nested array unwrap과 id 직접 입력 fallback (Issue #65, #76)
- [ADR-029](029-wiki-page-file-multipart-order.md) — wiki page file multipart `type` 필드 순서 의존성 (Issue #70)
- [ADR-030](030-resolveproject-numeric-fallback.md) — `resolveProject` numeric 입력 cache 우회 fallback (Issue #78)
- [ADR-031](031-file-json-output-schema.md) — file 명령군 `--json` 출력 스키마 통일 (`post file`과 `wiki page file`, Issue #73)
- [ADR-032](032-wiki-page-delete.md) — wiki page delete 를 DELETE endpoint 로 구현 (Issue #87)
- [ADR-033](033-messenger-send.md) — messenger send / channel-send Dooray Messenger API 래핑 (Issue #88)
- [ADR-034](034-wiki-tree-drill-down.md) — wiki tree 레벨별 drill-down 재귀 조립 (flat list endpoint 부재, Issue #101)
- [ADR-035](035-managed-skill-lifecycle.md) — Claude Code·Codex 스킬 명시 갱신과 버전·해시별 관리형 저장소
- [ADR-036](036-delete-confirmation-policy.md) — 삭제 명령 공통 확인·비대화형 선차단 정책
- [ADR-037](037-bulk-post-collection-pitfalls.md) — 업무 대량 수집 시 Dooray API 함정 (그룹 담당·조용한 속도 제한·목록 응답 body 부재)
- [ADR-038](038-persona-skill-outside-managed-install.md) — `dooray-persona` 스킬을 관리형 설치 체계 밖에 둔다
- [ADR-039](039-rate-limit-token-bucket.md) — Dooray 요청 제한을 응답 헤더로 보정하는 클라이언트 토큰 풀
- [ADR-040](040-mail-url-to-uid-lookup.md) — 웹 메일 주소의 mail id 를 시각으로 풀어 IMAP UID 를 찾는다 (Issue #141)
- [ADR-041](041-project-tag-write-scope.md) — 프로젝트 태그 쓰기를 공식 문서 지원 범위(생성·그룹 속성)로 한정 (Issue #146)
- [ADR-042](042-cache-invalidation-on-mutation.md) — 캐시의 유효성을 깨는 변경은 services 계열이 맡고 그 안에서 캐시를 지운다 (엔티티 mutation, config 의 계정·환경 변경)
- [ADR-043](043-wiki-name-search-and-project-column.md) — 위키를 이름으로 찾는 `wiki list --search` 와 목록의 project 열, `dooray://` 앞 숫자가 orgId 임을 알리는 오류 안내 (Issue #154)
- [ADR-044](044-post-input-error-completed-command.md) — post 입력 오류가 실제 실행 인자를 고쳐 만든 완성 명령을 보여준다 (Issue #154)
- [ADR-045](045-wiki-page-standalone-fetch.md) — 위키 페이지를 페이지 ID 하나로 조회하고 wikiId 를 응답에서 얻는다 (공식 `GET /wiki/v1/pages/{page-id}`, Issue #154)
- [ADR-046](046-official-api-doc-precedence.md) — API 동작의 근거는 공식 문서이고 저장소 서술이 어긋나면 저장소를 고친다 (Issue #154)
- [ADR-047](047-wiki-page-move.md) — 위키 페이지 이동을 공식 move endpoint 로 감싸 `wiki page move` 로 둔다 (Issue #148)
- [ADR-048](048-checks-to-mjs.md) — 문서 검사 스크립트를 셸에서 `node:` 빌트인만 쓰는 `.mjs` 로 옮긴다
- [ADR-049](049-config-read-result-states.md) — `getConfig` 가 파일 부재와 손상과 읽기 실패를 구분해 돌려준다 (Issue #151)
- [ADR-050](050-agent-overlay-boundary.md) — 전용 agent 를 두지 않고 저장소 고유 지침은 오버레이가 문서 경로로 실어 코어 역할 계약에 얹는다
- [ADR-051](051-json-large-integer-precision.md) — 응답 JSON 의 큰 정수를 `ky` 의 `parseJson` 공통 파서로 문자열 보존 (`direct-send` 의 log-id 손실)
- [ADR-052](052-messenger-thread-send.md) — 메신저 스레드 생성을 `thread-send` 한 명령에 `--log` 분기로 둔다 (`threadChannelId` 필드 부재 실측)
- [ADR-053](053-body-mimetype-preservation.md) — 본문 수정 시 기존 mimeType 을 보존하고 `--mime-type` 으로 덮어쓴다 (신규 작성은 markdown 기본 유지)
- [ADR-054](054-private-project-resolution.md) — 개인 프로젝트 코드는 공용 목록에서 실패한 자리에서 private 목록을 받아 다시 찾는다 (Issue #173)
- [ADR-055](055-body-mimetype-aware-markup.md) — 본문에 마크업을 넣고 빼는 경로는 그 본문의 mimeType 에 맞는 문법을 쓴다 (Issue #173)
- [ADR-056](056-json-enrichment-behind-option.md) — `--json` 의 raw 유지는 그대로 두고 이름 보강은 `--with-tag-names` 로 연다 (Issue #174)
- [ADR-057](057-download-all-includes-inline-files.md) — `download-all` 은 첨부 목록과 본문에 삽입된 파일을 함께 받는다 (Issue #171)
- [ADR-058](058-unknown-option-usage-hint.md) — 알 수 없는 옵션 오류에 그 이름의 실제 사용법을 붙인다 (Issue #170)
- [ADR-059](059-plan-check-owned-by-skill.md) — plan 검사는 `planning` 스킬의 `verify_task.py` 가 소유하고 저장소 검사기와 CI 스텝을 없앤다
- [ADR-060](060-mail-reply-confirmation-policy.md) — 메일 답장은 입력 형식과 무관하게 확인을 거친다 (UID 직접 입력 포함, Issue #179)
- [ADR-061](061-messenger-logs-read.md) — 메신저 대화방 읽기를 `messenger logs` 로 두고 최근 N건(상한 1000)까지만 지원한다 (페이징·날짜 필터 부재 실측)
- [ADR-062](062-undocumented-endpoint-policy.md) — 공식 문서에 없는 endpoint 는 조건 넷을 채운 읽기 전용에만 쓴다
- [ADR-063](063-calendar-read-commands.md) — 캘린더는 읽기 세 명령만 두고 기간은 항상 양끝을 보낸다 (기간 상한 50일·종일 `endedAt` exclusive·목록 `me` 로 참여 판정 실측)
- [ADR-064](064-post-list-filters.md) — `post list` 에 사람·상위 업무·기간·정렬 필터를 열고 기간과 정렬은 CLI 가 검증한다 (날짜만 준 범위·`~B`·같은 시각 400, 모르는 `order` 무시, 끝 `9999-12-31` 500 실측. 멤버 옵션은 한 명)
- [ADR-066](066-messenger-channels.md) — 대화방 목록을 `messenger channels` 로 두고 필터·정렬은 클라이언트에서 한다 (`size` 무시·제목 빈 방 154/230 실측, 제목 없는 방은 참여자 이름으로 표시, 숨긴 방 기본 제외)
