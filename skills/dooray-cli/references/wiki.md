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

## 페이지 삭제

`wiki page delete` 는 Dooray 가 공식 문서화하지 않은 endpoint 를 쓴다.
동작은 확인했지만 서버 정책이 바뀌면 깨질 수 있으니, 대량 삭제 전에 한 건으로 먼저 확인한다.

빈 제목·본문으로 덮는 soft delete 우회는 쓰지 않는다 — 페이지가 트리에 남아 혼란을 준다.

하위 페이지가 있는 페이지를 지우면 하위는 삭제한 페이지의 부모 아래로 재부착된다. orphan 은 생기지 않는다.

## 위키 페이지 이동은 불가능하다

`parentPageId` 를 바꾸는 이동은 API 로 할 수 없다. 수정 요청이 `parentPageId` 를 무시하고 전용 endpoint 도 없다.
사용자가 이동을 요청하면 웹 UI 를 안내한다.
