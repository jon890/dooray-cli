## ADR-047: 위키 페이지 이동을 공식 move endpoint 로 감싸 별도 명령으로 둔다

- **status**: `accepted`

- **결정**: `dooray wiki page move` 를 새로 만들고 `POST /wiki/v1/wikis/{wiki-id}/pages/{page-id}/move` 를 부른다.
  `wiki page edit --parent` 로 넣지 않고 별도 명령으로 둔다.
  `--parent` 를 필수로 받고 `--to-wiki`, `--before`, `--first`, `--no-children` 을 선택으로 받는다.
  입력 해석은 `resolveWikiPageInput` 을 재사용한다.

- **맥락**: 위키 트리를 정리하려면 페이지를 지우고 다시 만드는 수밖에 없었다 (Issue #148).
  그러면 첨부와 인라인 이미지와 댓글과 페이지 ID 가 사라진다.

  이슈 제보자가 실측으로 확인한 것은 이렇다.
  `PUT /wiki/v1/wikis/{wikiId}/pages/{pageId}` 에 `parentPageId` 나 `parentId` 나 `movePageId` 를 보내면
  응답이 `isSuccessful: true` 인데 실제 부모는 바뀌지 않는다.
  요청이 반영되지 않았는데 성공으로 돌아오므로 호출자가 알 수 없다.

  이슈와 이 저장소의 스킬 문서는 전용 endpoint 가 없고 웹 UI 만 쓴다고 보았다.
  공식 API 문서를 확인한 결과 사실이 아니다. `move` 가 공개 API 에 있다.
  이슈가 찾은 `<tenant>.dooray.com/v2/wapi/.../move` 는 웹 앱 내부 경로이고,
  공식 경로는 `api.dooray.com` 의 `wiki/v1` 아래에 있어 기존 클라이언트와 host 도 인증도 같다.

  이 저장소의 서술을 근거로 삼지 않고 공식 문서를 확인해 얻은 결과다.
  저장소에 적힌 API 서술은 근거가 아니라 그때의 확인 결과이고, 공식 문서와 어긋나면 공식 문서를 따른다.

  공식 스펙의 요청 본문은 이렇다.

  | 필드 | 필수 | 뜻 |
  | --- | --- | --- |
  | `targetParentPageId` | 필수 | 이동 대상 부모 페이지 id |
  | `targetWikiId` | 선택 | 이동 대상 위키 id |
  | `withChildren` | 선택 | 하위 페이지까지 함께 이동. 기본값 참 |
  | `beforePageId` | 선택 | 이 페이지 바로 뒤에 위치. `null` 이면 정렬 변경 없음, `0` 이면 맨 앞 |

- **왜 `edit --parent` 가 아니라 별도 명령인가**: `wiki page edit` 은 제목과 본문을 바꾸는 명령이고
  `PUT` 하나를 부른다. 이동은 다른 endpoint 이고 실패 지점이 따로다.
  `post edit --parent` 가 그 둘을 한 명령에 담은 결과가 이미 문제를 보이고 있다.
  `src/commands/post/edit.ts:210` 이 「본문은 수정되었으나 상위 업무 변경에 실패했습니다」를 내고
  같은 파일 229행이 「`--parent` 는 `--title`·`--body` 와 함께 사용 시에만 적용됩니다」를 낸다.
  두 경고가 필요한 것 자체가 한 명령에 두 작업을 담은 비용이다.
  이동만 하려는 사용자가 제목이나 본문을 함께 줘야 하는 것도 그 결과다.

  이슈도 「`wiki page move` 를 별도 명령으로 두는 편이 뜻이 분명하다」고 적었다.

- **왜 `--to-wiki` 를 함께 넣는가**: 같은 endpoint 가 부모 변경과 위키 간 이동을 함께 처리한다.
  빼면 CLI 가 그 endpoint 로 되는 일 하나를 못 하는 상태가 남고, 나중에 같은 명령을 다시 열어야 한다.
  `targetWikiId` 필드 하나와 `resolveWiki` 호출 하나가 추가 비용의 전부다.

- **왜 확인 절차를 넣지 않는가**: ADR-036 의 확인 정책은 되돌릴 수 없는 삭제 명령을 대상으로 한다.
  이동은 되돌릴 수 있다. 같은 명령으로 원래 부모를 지정하면 제자리로 온다.
  `withChildren` 기본값이 참이라 하위 트리가 함께 움직이지만 그것도 되돌려진다.
  그래서 확인을 넣지 않고, 하위가 함께 이동했다는 것을 출력에 알린다.

- **대안 기각**:
  - `wiki page edit --parent` 로 넣는다. 위에 적은 두 작업 혼합 비용을 그대로 받는다.
  - 웹 앱 내부 경로 `<tenant>.dooray.com/v2/wapi/.../move` 를 쓴다.
    공식 경로가 있으므로 쓸 이유가 없다. host 와 인증 체계가 달라 config 에 두 번째 host 개념이 생기고,
    내부 경로는 예고 없이 바뀐다.
  - `--parent` 를 선택으로 두고 정렬만 바꾸는 사용을 허용한다.
    공식 스펙이 `targetParentPageId` 를 필수로 정한다. 선택으로 두면 서버가 거부하는 요청을 만들 수 있다.
  - 지우고 다시 만드는 것을 문서로 안내한다. 이슈가 지적한 손실이 그대로 남는다.

- **결과**:
  - 얻는 것: 위키 트리를 CLI 로 정리할 수 있다. 첨부와 인라인 이미지와 댓글과 페이지 ID 가 유지된다.
    하위 트리를 한 번에 옮기거나 (`withChildren` 기본값) 페이지 하나만 옮길 수 있다 (`--no-children`).
    형제 사이의 정렬도 `--before` 와 `--first` 로 바꾼다.
  - 감당할 것: 명령이 하나 늘어난다.
    `beforePageId` 의 `0` 은 맨 앞을 뜻하는 특수값이라 `--first` 라는 별도 플래그로 감싸야 한다.
    빈 문자열과 `0` 과 미지정 셋을 구별해 보내야 하고, 그 구별이 틀리면 정렬이 의도와 다르게 바뀐다.
    위키 간 이동은 대상 위키에 권한이 없으면 4xx 로 드러난다. 사전 검증을 두지 않는다.

- **적용 범위**: `src/api/client.ts` 에 `moveWikiPage(wikiId, pageId, body)` 를 둔다.
  응답 `result` 가 `null` 이므로 `DoorayApiUnitResponse` 를 쓴다. `deleteWikiPage` 와 같다.

  `wiki page edit` 은 바뀌지 않는다. `parentPageId` 를 무시한다는 사실도 그대로다.
  그 명령에 `--parent` 를 넣지 않으므로 사용자가 그것을 시도할 자리가 없다.
