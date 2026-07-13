# Phase 02 — 28 ADR 섹션 → docs/adr/NNN-slug.md verbatim 이전

## 컨텍스트

원본 `docs/adr.md` 의 각 `## ADR-NNN: Title` 섹션을 개별 파일로 이전한다.
형식은 **phase-01.md 규격** — `## ADR-NNN: Title` 헤더로 시작, 본문 verbatim, `<a id>` 앵커·`---` 구분자 제거, frontmatter 없음.

worktree·branch 동일. 원본은 읽기만.

## slug 매핑 (파일명 확정 — 그대로 사용)

| ADR | 파일명 |
| --- | --- |
| 001 | `001-typescript-node.md` |
| 002 | `002-ky-http-client.md` |
| 004 | `004-disk-cache.md` |
| 005 | `005-postnumber-identifier.md` |
| 006 | `006-editor-edit-flow.md` |
| 007 | `007-config-file-only.md` |
| 008 | `008-member-ambiguity-error-candidates.md` |
| 010 | `010-cache-file-split.md` |
| 012 | `012-imap-mail.md` |
| 013 | `013-smtp-mail.md` |
| 014 | `014-ts-path-alias-deferred.md` |
| 015 | `015-file-attachment-307-redirect.md` |
| 016 | `016-setup-interactive-wizard.md` |
| 017 | `017-api-types-single-file.md` |
| 018 | `018-setup-skill-install.md` |
| 019 | `019-post-create-metadata-options.md` |
| 020 | `020-post-input-unification-vitest.md` |
| 021 | `021-member-command-creator-enrich.md` |
| 022 | `022-feedback-gh-cli.md` |
| 023 | `023-feedback-last-run-tracking.md` |
| 024 | `024-comment-file-synthesis.md` |
| 025 | `025-post-cc-to-member-group.md` |
| 026 | `026-wiki-api-pitfalls.md` |
| 027 | `027-post-create-template.md` |
| 028 | `028-member-group-response-shape.md` |
| 029 | `029-wiki-page-file-multipart-order.md` |
| 030 | `030-resolveproject-numeric-fallback.md` |
| 031 | `031-file-json-output-schema.md` |

(003·009·011 결번 — 원본에 없음. 28개.)

## 무손실 규칙

- 각 ADR 섹션 본문(`## ADR-NNN:` 다음 줄부터 다음 ADR 직전 `---` 전까지)을 요약·재작성 없이 그대로.
- `<a id="adr-NNN"></a>` 줄과 섹션 끝 `---` 은 옮기지 않는다(파일 경계가 대신).
- `## ADR-NNN: Title` 헤더는 파일 안에 유지.

## 작업 항목 (5개 이하)

1. 원본에서 각 ADR 섹션을 추출해 위 매핑 파일명으로 `docs/adr/` 에 생성 (28파일).
2. 각 파일이 `## ADR-NNN:` 로 시작하고 앵커/구분자 없는지 확인.
3. 완결성 검증 통과.
4. index.json phase 2 completed, current_phase 3. commit (`chore(adr): migrate 28 ADRs to per-file`).

## 검증 (완결성 + 무손실)

```bash
WT=/Users/nhn/personal/dooray-cli/.claude/worktrees/adr-directory-split
# 원본 ADR 헤더 수 (기대 28)
grep -cE "^## ADR-[0-9]+" "$WT/docs/adr.md"
# 생성 파일 수 (기대 28, INDEX 제외)
ls "$WT"/docs/adr/*-*.md | wc -l
# 각 ADR 번호가 파일에 하나씩
for n in 001 002 004 005 006 007 008 010 012 013 014 015 016 017 018 019 020 021 022 023 024 025 026 027 028 029 030 031; do
  ls "$WT/docs/adr/$n-"*.md >/dev/null 2>&1 || echo "누락: ADR-$n"
done
# 앵커 잔존 0
grep -rl "<a id=\"adr-" "$WT"/docs/adr/*-*.md && echo "앵커 잔존!" || echo "앵커 0 OK"
```

- 28파일, 누락 0, 앵커 0. 원본 미변경.
- 무손실 spot-check: 원본 임의 3개 ADR 본문과 새 파일 대조.
