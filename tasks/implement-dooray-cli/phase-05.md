# Phase 5: Post 읽기 커맨드 + Editor

## 컨텍스트

`dooray-cli`는 Dooray REST API를 CLI로 래핑하는 TypeScript 프로젝트다.
프로젝트 루트: `/Users/nhn/personal/dooray-cli`
이전 phase에서 Formatters + Project 커맨드 완료. 실제 API 호출 동작 확인됨.

설계 문서:
- `docs/flow.md` — 일반 조회 흐름, 업무 수정 흐름 ($EDITOR)
- `docs/code-architecture.md` — editor/ 모듈 구조
- `docs/adr.md` — ADR-005(postNumber), ADR-006($EDITOR 기반 수정)

## 목표

Post 읽기 커맨드(list, search, get)와 $EDITOR 기반 수정(edit) 커맨드를 구현한다.

## 작업 목록

### Post 읽기 커맨드
- [ ] `src/commands/post/list.ts` — `dooray post list <project> [--subject <keyword>] [--all] [--page N] [--size N]`
  - ProjectResolver로 projectId 해석
  - `--subject` : subjects 파라미터로 필터링
  - `--all` : 자동 페이지네이션 (page 0부터 결과가 끝날 때까지 반복)
  - formatPostList로 테이블 출력 (number, subject, workflow.name, priority)
- [ ] `src/commands/post/search.ts` — `dooray post search <project> <keyword>`
  - `post list --subject <keyword>` 의 shorthand
  - 내부적으로 getPosts(projectId, { subjects: keyword }) 호출
- [ ] `src/commands/post/get.ts` — `dooray post get <project> <post-number>`
  - ProjectResolver로 projectId 해석
  - PostResolver로 postNumber → postId 변환
  - getPost(projectId, postId)로 상세 조회
  - formatPostDetail로 상세 출력 (subject, body, workflow, priority, users, dates)

### Editor 모듈
- [ ] `src/editor/index.ts`
  - `openInEditor(content: string): Promise<string>` — 임시 파일 생성 → $EDITOR 실행 → 수정 결과 읽기 → 임시 파일 삭제
  - `serializePostFrontmatter(post: PostDetail): string` — PostDetail → YAML frontmatter + body 문자열
  - `parsePostFrontmatter(content: string): { subject, priority, dueDate, to, cc, body }` — 문자열 → 파싱된 객체
  - $EDITOR 미설정 시 DoorayCliError + "export EDITOR=vim" 안내
  - 사용자가 변경 없이 저장하면 "변경사항 없음" 출력 후 종료

### Post Edit 커맨드
- [ ] `src/commands/post/edit.ts` — `dooray post edit <project> <post-number>`
  - ProjectResolver → PostResolver로 postId 확보
  - getPost로 현재 업무 조회
  - serializePostFrontmatter로 임시 파일 내용 생성:
    ```yaml
    ---
    subject: 현재 제목
    priority: normal
    due_date: 2026-04-30T18:00:00+09:00
    to:
      - user@example.com
    cc: []
    ---
    본문 마크다운...
    ```
  - openInEditor로 에디터 열기
  - parsePostFrontmatter로 결과 파싱
  - MemberResolver로 to/cc의 이메일/이름 → organizationMemberId 변환
  - updatePost API 호출
  - 성공 메시지 출력

- [ ] `src/index.ts`에 post 커맨드 그룹 등록 (list, search, get, edit)

## 성공 기준

1. `npm run build` 성공
2. `node dist/index.js post list <project-code>` 가 업무 목록 테이블 출력
3. `node dist/index.js post list <project-code> --subject "키워드"` 가 필터된 목록 출력
4. `node dist/index.js post search <project-code> "키워드"` 가 검색 결과 출력
5. `node dist/index.js post get <project-code> <number>` 가 업무 상세 출력
6. `node dist/index.js post list <project-code> --json` 이 JSON 출력
7. editor 모듈의 frontmatter 직렬화·파싱이 정확히 동작 (to/cc에 이메일 목록 포함)

## 주의사항

- post number는 프로젝트 내에서 유니크한 정수 (e.g., 42). `postNumber` 파라미터로 API 검색.
- PostDetail의 users.to는 `PostUser[]` 배열이고, 각 항목의 member.organizationMemberId를 캐시에서 emailAddress로 역변환해야 frontmatter에 이메일을 표시할 수 있다.
- 역변환 실패 시 (캐시에 없는 멤버) organizationMemberId를 그대로 표시한다.
- `--all` 페이지네이션: size=100, totalCount와 비교하여 다음 page 호출 여부 결정.
- tmp 패키지로 임시 파일 생성. 에디터 종료 후 반드시 cleanup.

## Blocked 조건

없음 — 이전 phase 성공 시 모든 의존성 충족.
