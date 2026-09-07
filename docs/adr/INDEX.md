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
- [ADR-032](032-wiki-page-delete.md) — wiki page delete 비공식(미문서화) DELETE endpoint (Issue #87)
- [ADR-033](033-messenger-send.md) — messenger send / channel-send Dooray Messenger API 래핑 (Issue #88)
- [ADR-034](034-wiki-tree-drill-down.md) — wiki tree 레벨별 drill-down 재귀 조립 (flat list endpoint 부재, Issue #101)
- [ADR-035](035-managed-skill-lifecycle.md) — Claude Code 스킬 명시 갱신과 버전·해시별 관리형 저장소
- [ADR-036](036-delete-confirmation-policy.md) — 삭제 명령 공통 확인·비대화형 선차단 정책
- [ADR-037](037-bulk-post-collection-pitfalls.md) — 업무 대량 수집 시 Dooray API 함정 (그룹 담당·조용한 속도 제한·목록 응답 body 부재)
- [ADR-038](038-persona-skill-outside-managed-install.md) — `dooray-persona` 스킬을 관리형 설치 체계 밖에 둔다
- [ADR-039](039-rate-limit-token-bucket.md) — Dooray 요청 제한을 응답 헤더로 보정하는 클라이언트 토큰 풀
- [ADR-041](041-project-tag-write-scope.md) — 프로젝트 태그 쓰기를 공식 문서 지원 범위(생성·그룹 속성)로 한정 (Issue #146)
- [ADR-042](042-cache-invalidation-on-mutation.md) — 캐시의 유효성을 깨는 변경은 services 계열이 맡고 그 안에서 캐시를 지운다 (엔티티 mutation, config 의 계정·환경 변경)
- [ADR-049](049-config-read-result-states.md) — `getConfig` 가 파일 부재와 손상과 읽기 실패를 구분해 돌려준다 (Issue #151)
