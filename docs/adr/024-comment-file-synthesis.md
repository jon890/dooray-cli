## ADR-024: `dooray post comment file *` — post-level files API + 댓글 PUT 합성

**결정**: `comment file {list,upload,download,delete}` 4 명령을 post-level files API (`/posts/{postId}/files`) + 댓글 본문 PUT (`/logs/{logId}`) 합성으로 구현.
사용자 멘탈 모델은 "댓글 첨부"이지만 실제 데이터 모델은 post-level files + 댓글 본문 markdown reference (`![filename](/files/<fileId>)`) 구조다.
`delete` 는 항상 markdown 제거 + 파일 삭제 단일 동작 (옵션 분기 없음).

**맥락**: Dooray 공식 API + 실 호출 검증 결과 댓글 전용 attachment endpoint **부재** (Issue #34) — 댓글 단건 GET 응답에 `files: PostFileDetail[]` embedded 만 존재.
인라인 이미지 자동화가 빈번해 댓글 전용 UX 가 필요 — 스킬이 댓글에 이미지를 삽입하는 패턴이 대표적.

**트레이드오프 (수용)**:
- **Atomic 부재**: 2-step (`upload`, `delete`) 중 1 step 만 성공 가능 — 부분 성공 시 stderr 안내 + non-zero exit
- **fileId namespace 가 post-level**: 같은 fileId 가 여러 댓글에서 참조 가능 → `delete` 가 다른 참조를 broken link 화 가능. 의도 명확화 위해 단일 동작
- **orphan file 노출**: `list` 가 `.files` 그대로 반환 (단일 소스 원칙), 본문 markdown 미참조 파일도 노출

**대안 기각**:
- 댓글 전용 endpoint — 부재. 비공개 endpoint 역공학 리스크 + 유지보수 부담
- markdown reference 제거 없이 파일만 삭제 — 본문 broken link 잔존 → UX 회귀
- 기존 `post file *` 안내 — 사용자가 댓글 ↔ post 본문 first attachment 구분 못함

각 명령 합성 동작은 `src/commands/post/comment/file/*.ts` 참조. 향후 Dooray 가 댓글 endpoint 도입하면 client API 만 교체 (CLI 시그니처 보존).
