## ADR-024: `dooray post comment file *` — post-level files API + 댓글 PUT 합성

**결정**: `comment file {list,upload,download,delete}`는 댓글 조회·수정 API와 post-level files API를 명령별로 조합한다.

- `list`는 댓글 단건 조회 응답의 선택적 `files`를 반환한다.
- `upload`는 post-level 파일 업로드 후 댓글 본문에 참조를 추가한다.
- `download`는 post-level 파일 다운로드를 댓글 명령 표면으로 감싼다.
- `delete`는 댓글 본문 참조를 제거한 뒤 post-level 파일을 삭제한다.

사용자 멘탈 모델은 "댓글 첨부"이지만 CLI가 관측할 수 있는 모델은 post-level files + 댓글 본문 마크다운 참조 구조다.
업로드는 `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg`, `avif`, `heic` 확장자를 대소문자 구분 없이 이미지로 분류해 `![filename](/files/<fileId>)`를 넣고, 그 외에는 `[filename](/files/<fileId>)`를 넣는다.
`delete`는 두 마크다운 형식을 모두 제거한 뒤 파일을 삭제한다.

**맥락**: Dooray 공식 API와 실 호출 검증 결과 댓글 전용 첨부 엔드포인트가 없다.
웹 UI는 본문 참조 없이도 댓글 아래에 첨부를 표시하지만, 댓글 단건 조회 응답은 이 연결 정보를 노출하지 않을 수 있다.
CLI는 공개 API만으로 같은 연결을 만들거나 완전하게 조회할 수 없어 본문 참조를 사용한다.
모든 파일을 이미지 마크다운으로 넣으면 비이미지 파일이 깨진 이미지로 렌더되어 클릭할 수 없으므로 파일 종류에 따라 참조 형식을 나눈다.

**트레이드오프 (수용)**:
- **원자성 부재**: 2단계 (`upload`, `delete`) 중 한 단계만 성공할 수 있다. 부분 성공 시 stderr 안내와 0이 아닌 종료 코드를 반환한다
- **fileId namespace 가 post-level**: 같은 fileId 가 여러 댓글에서 참조 가능 → `delete` 가 다른 참조를 broken link 화 가능. 의도 명확화 위해 단일 동작
- **조회 불완전**: `list`는 댓글 조회 응답의 선택적 `files`만 반환한다. 웹 UI 첨부처럼 응답에 연결 정보가 없으면 빈 목록이 될 수 있으며 업무 단위 `post file list`로 확인해야 한다
- **확장자 기반 분류**: 실제 파일 내용을 검사하지 않아 확장자가 잘못된 파일은 기대와 다르게 렌더될 수 있지만, 추가 I/O와 MIME 판별 의존성을 피한다

**대안 기각**:
- 댓글 전용 엔드포인트 — 부재. 비공개 엔드포인트 역공학 위험과 유지보수 부담
- 모든 파일에 이미지 마크다운 사용 — 비이미지 파일이 깨진 이미지로 표시되고 열 수 없음
- MIME 또는 파일 내용 검사 — 업로드 전 추가 I/O와 판별 복잡도에 비해 파일명 확장자가 CLI 입력 계약에 충분
- markdown reference 제거 없이 파일만 삭제 — 본문 broken link 잔존 → UX 회귀
- 기존 `post file *` 안내 — 사용자가 댓글 ↔ post 본문 first attachment 구분 못함

각 명령 합성 동작은 `src/commands/post/comment/file/*.ts` 참조. 향후 Dooray 가 댓글 endpoint 도입하면 client API 만 교체 (CLI 시그니처 보존).
