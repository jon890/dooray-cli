# wiki

## 페이지 계층 훑기

`wiki tree --json` 은 flat 배열이고 `wiki pages --json` 과 같은 스키마다.
`parentPageId` 로 계층을 조립하므로 두 명령의 파싱 코드를 공유할 수 있다.
`wiki pages` 는 root 만 주고, 전체 계층이 필요하면 `wiki tree` 를 쓴다.

```bash
dooray wiki tree <project> --json
dooray wiki tree <project> --depth 2        # 깊이 상한
```

## 인라인 이미지는 본문에 자동 삽입되지 않는다

`--type inline_image` 로 올려도 본문은 바뀌지 않는다.
`--json` 의 `markdownSnippet` 을 받아 본문에 직접 넣어야 화면에 보인다.

```bash
SNIPPET=$(dooray wiki page file upload <project> <page-id> \
  --file ./diagram.png --type inline_image --json | jq -r '.markdownSnippet')
# → "![diagram.png](/wikis/<wikiId>/files/<attachFileId>)"

CURRENT_BODY=$(dooray wiki page get <project> <page-id> --json | jq -r '.body.content')
dooray wiki page edit <project> <page-id> --body "${CURRENT_BODY}

${SNIPPET}"
```

기존 본문을 먼저 받아 뒤에 이어 붙인다 — `--body` 는 전체 교체이므로 snippet 만 넣으면 본문이 사라진다.

## 첨부 일괄 내려받기

```bash
dooray wiki page file download-all <project> <page-id> -o <dir>
dooray wiki page file list <project> <page-id>   # type 컬럼으로 general 과 inline_image 구분
```

`list` 는 general 첨부와 inline 이미지를 합쳐 보여준다.

## 삭제 안전 확인

다음 위키 삭제 명령은 같은 안전 확인 정책을 따른다.

- `dooray wiki page delete`
- `dooray wiki page file delete`
- `dooray wiki page comment delete`

TTY 확인, non-TTY 실행, `-y`와 `--yes` 사용법은 [SKILL.md](../SKILL.md#삭제-명령의-확인-동작)를 따른다.

## 페이지 삭제

`wiki page delete` 는 Dooray 가 공식 문서화하지 않은 endpoint 를 쓴다.
동작은 확인했지만 서버 정책이 바뀌면 깨질 수 있으니, 대량 삭제 전에 한 건으로 먼저 확인한다.

빈 제목·본문으로 덮는 soft delete 우회는 쓰지 않는다 — 페이지가 트리에 남아 혼란을 준다.

하위 페이지가 있는 페이지를 지우면 하위는 삭제한 페이지의 부모 아래로 재부착된다. orphan 은 생기지 않는다.

## 위키 페이지 이동은 불가능하다

`parentPageId` 를 바꾸는 이동은 API 로 할 수 없다. 수정 요청이 `parentPageId` 를 무시하고 전용 endpoint 도 없다.
사용자가 이동을 요청하면 웹 UI 를 안내한다.

## 위키 페이지 이동 사용법

페이지를 옮길 때는 새 부모 페이지를 `--parent` 로 반드시 지정한다.

```bash
dooray wiki page move <project> <page-id> --parent <parent-page-id>
```

`--id <page-id>` 로 페이지를 직접 지정할 수 있다.
`--project <project>` 를 함께 주면 CLI 가 wikiId 해석 호출을 줄인다.
`--project` 는 선택이다.

하위 페이지는 기본으로 함께 이동한다.
페이지 하나만 옮기려면 `--no-children` 을 붙인다.

```bash
dooray wiki page move --id <page-id> --parent <parent-page-id> --no-children
```

형제 사이 정렬은 `--first` 또는 `--before <page-id>` 로 바꾼다.
다른 위키로 옮길 때는 `--to-wiki <project-or-wiki-id>` 를 붙인다.
값에는 프로젝트 코드나 위키 ID 를 줄 수 있다.
대상 위키에 권한이 없으면 명령은 오류로 끝난다.

이동 명령에는 삭제 명령처럼 실행 전 확인 절차가 없다.

페이지를 지우고 다시 만드는 방식은 쓰지 않는다.
첨부와 인라인 이미지, 댓글, 페이지 ID 가 사라진다.

`wiki page edit` 은 부모를 바꾸지 못한다.
수정 요청에 부모 필드를 넣어도 해당 필드는 무시된다.
