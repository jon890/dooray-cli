# wiki

## 페이지 ID 만 알 때

**project 를 찾을 필요가 없다.** `--id` 하나로 조회한다.

```
dooray wiki page get --id <page-id>
```

같은 방식이 `wiki page` 하위 명령 전체에 통한다.
`wiki page file`, `wiki page comment`, `wiki page delete` 도 `--id` 만으로 동작한다.

`--project` 는 선택이다. 함께 주면 wikiId 를 해석하는 호출을 한 번 아낀다.
반복 실행하는 자동화라면 함께 주는 편이 빠르다.

위키를 이름으로 찾아야 하는 경우는 다음 절에서 다룬다.

## 위키를 이름으로 찾는다

페이지 ID 를 모르고 위키 자체를 찾아야 할 때, 또는 그 위키의 페이지 목록이나 트리를 보려 할 때 쓴다.

```
dooray wiki list --search <위키 이름 일부>   # Project 열의 값이 다음 명령의 project 인자다
dooray wiki pages <project>
dooray wiki tree <project>
```

- `--search` 는 이름을 대소문자 무시 부분 일치로 찾는다. 이름의 대소문자를 가정하지 않아도 된다.
- `--search` 는 전체 목록에서 찾으므로 `--page` 와 `--size` 를 무시한다.
- `--json` 은 서버 응답을 그대로 내므로 project 코드가 없다.
  자동화는 `project.id` 를 그대로 project 자리에 넣을 수 있다.

## 위키 본문 링크의 앞 숫자는 project 가 아니다

위키 본문의 페이지 링크는 `dooray://<orgId>/pages/<pageId>` 형태다.
앞 숫자는 orgId 이고 project 도 위키 ID 도 아니다.
그 값을 project 자리에 넣으면 `프로젝트에 위키가 없습니다` 로 끝난다.

pageId 는 뒤 숫자다. 그것만 떼어 `--id` 에 넣으면 된다.

브라우저 주소창의 `https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>` 형태는 `--url` 로 그대로 넣을 수 있다.

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

기존 본문을 먼저 받아 뒤에 이어 붙인다. `--body` 는 전체 교체이므로 snippet 만 넣으면 본문이 사라진다.

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

빈 제목·본문으로 덮는 soft delete 우회는 쓰지 않는다. 페이지가 트리에 남아 혼란을 준다.

하위 페이지가 있는 페이지를 지우면 하위는 삭제한 페이지의 부모 아래로 재부착된다. orphan 은 생기지 않는다.

## 위키 페이지 이동은 불가능하다

`parentPageId` 를 바꾸는 이동은 API 로 할 수 없다. 수정 요청이 `parentPageId` 를 무시하고 전용 endpoint 도 없다.
사용자가 이동을 요청하면 웹 UI 를 안내한다.
