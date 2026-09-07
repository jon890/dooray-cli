# Phase 04. 공개 문서에 위키 조회 절차와 새 옵션을 적는다

**Execution profile**: standard

## 목표

앞 세 phase 가 만든 것을 `README.md` 와 `skills/dooray-cli/` 에 적는다.
이슈가 요청한 것이 스킬 문서 보강이므로 이 phase 가 그 요청을 직접 닫는다.

적을 것은 넷이다.
페이지 ID 하나만 아는 상태에서 project 를 찾아가는 절차,
위키 본문 링크의 앞 숫자가 orgId 라는 것,
`wiki list --search` 사용법,
위키 이름의 대소문자를 가정하지 않는다는 것이다.

**범위 외**: `docs/` 와 `CLAUDE.md` 와 ADR 은 이미 갱신되어 있다. 다시 손대지 않는다.
코드 변경은 phase 01 부터 03 이 소유한다.

## 컨텍스트

**근거 문서**: `docs/adr/043-wiki-name-search-and-project-column.md`,
`docs/adr/044-post-input-error-completed-command.md`,
`docs/flow.md` 의 「위키 흐름」 절.
그 절에 이미 절차가 적혀 있으므로 공개 문서는 그것과 어긋나지 않게 쓴다.

`README.md` 와 `skills/dooray-cli/SKILL.md` 에는 내부 추적 번호를 넣지 않는다.
`ADR-NNN`, `Issue #NN`, `task NN` 이 모두 금지 대상이다.
`CLAUDE.md` 의 「공개 문서(README · 공개 SKILL)」 절이 이 규칙을 소유하고 `scripts/check-public-refs.sh` 가 검사한다.

현재 상태는 이렇다.

- `skills/dooray-cli/SKILL.md` 의 「위키」 절이 의도와 커맨드를 짝지은 표다.
  `위키 목록` 행이 `dooray wiki list` 이고 `페이지 상세` 행이 `dooray wiki page get <project> <page-id>` 다.
- 같은 파일 24번째 줄 근처에 네 가지 입력 형태를 받는 명령 목록이 있다.
  지금은 `wiki page file` 과 `wiki page comment` 전체와 `wiki page delete` 만 적혀 있다.
- `skills/dooray-cli/references/wiki.md` 가 위키 영역의 절차와 유의할 점을 담는다.
  「페이지 계층 훑기」로 시작해 「위키 페이지 이동은 불가능하다」로 끝난다.
- `skills/dooray-cli/references/common.md` 가 설치 방법을 담는다.

## 의도 메모

- 절차를 `references/wiki.md` 에 두고 `SKILL.md` 의 표에는 옵션만 더한다.
  `SKILL.md` 는 빠른 참조이고 절차는 참조 문서가 담는다는 기존 분담을 지킨다.
- orgId 설명에 ADR 번호를 달지 않는다. 공개 문서에 내부 참조를 넣지 않는 규칙 때문이다.
  왜 그런지는 `docs/adr/` 이 소유하고, 공개 문서는 그 값이 무엇이고 어떻게 하면 되는지만 적는다.
- `--json` 에 project 코드가 없다는 것을 적는다. 자동화가 표 출력을 기대하면 어긋난다.

## 작업 항목

### 1. `skills/dooray-cli/references/wiki.md` 에 위키를 찾아가는 절차를 더한다

파일 맨 앞의 「페이지 계층 훑기」 절보다 앞에 새 절을 넣는다.
페이지 ID 하나로 시작하는 것이 가장 흔한 출발점이라 먼저 읽혀야 한다.

절 제목은 `페이지 ID 만 알 때 project 를 찾는다` 로 한다. 담을 내용은 이렇다.

- `wiki page get` 이 project 를 먼저 요구한다는 것.
- 두 단계 절차와 명령 예시.

  ```bash
  dooray wiki list --search <위키 이름 일부>   # Project 열의 값이 다음 명령의 project 인자다
  dooray wiki page get <project> <page-id>
  ```

- `--search` 가 이름을 대소문자 무시 부분 일치로 찾는다는 것.
  이름의 대소문자를 가정하지 않아도 된다는 것을 한 문장으로 적는다.
- `--search` 는 전체 목록에서 찾으므로 `--page` 와 `--size` 를 무시한다는 것.
- `--json` 은 서버 응답을 그대로 내므로 project 코드가 없다는 것.
  자동화는 `project.id` 를 그대로 `wiki page get` 에 넣을 수 있다는 것.

그다음 절을 하나 더 넣는다. 제목은 `위키 본문 링크의 앞 숫자는 project 가 아니다` 로 한다.

- 위키 본문의 페이지 링크가 `dooray://<orgId>/pages/<pageId>` 형태라는 것.
- 앞 숫자가 orgId 이고 project 도 위키 ID 도 아니라는 것.
- 그 값을 project 자리에 넣으면 `프로젝트에 위키가 없습니다` 로 끝난다는 것.
- pageId 는 뒤 숫자이므로 그것만 떼어 위 절차의 `<page-id>` 로 쓴다는 것.
- 브라우저 주소창의 `https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>` 형태는
  `--url` 로 그대로 넣을 수 있어 project 가 필요 없다는 것.

`<tenant>` 는 placeholder 로 둔다. 실제 사내 도메인을 적지 않는다.

### 2. `skills/dooray-cli/SKILL.md` 의 위키 표를 갱신한다

「위키」 절의 표에서 두 행을 고치고 한 행을 더한다.

- `위키 목록` 행의 커맨드를 `dooray wiki list` 로 두고 설명을 더한다.
  `ID`, `Name`, `Project`, `Type` 네 열을 낸다는 것과 `--search` 로 이름을 찾는다는 것을 적는다.
- `이름으로 위키 찾기` 행을 새로 더한다.
  커맨드는 `dooray wiki list --search <keyword>` 이고, 대소문자를 무시한 부분 일치이며 전체 목록에서 찾는다고 적는다.
- `페이지 상세` 행에 네 가지 입력 형태를 받는다는 것을 더한다.

### 3. `skills/dooray-cli/SKILL.md` 의 입력 형태 목록에 `wiki page get` 을 더한다

24번째 줄 근처의 문장을 고친다.
지금 `wiki page file` 과 `wiki page comment` 전체와 `wiki page delete` 를 적고 있으므로 `wiki page get` 을 그 목록에 넣는다.

### 4. `skills/dooray-cli/SKILL.md` 에 post 입력 오류 안내를 한 줄 적는다

post 계열을 다루는 절에 한 문장을 더한다.
내부 ID 를 positional 로 넣으면 오류가 나고, 그 오류가 `--id` 를 쓴 완성 명령을 그대로 보여주므로
그 줄을 복사해 실행하면 된다는 것이다.
자동화가 오류 출력을 읽고 재시도할 수 있다는 점을 한 문장으로 적는다.

### 5. `README.md` 에 사용 예를 더한다

위키를 다루는 예시가 있는 자리에 두 줄을 더한다.

```
dooray wiki list --search 설계          # 위키 이름으로 찾기 (대소문자 무시)
dooray wiki page get --url "https://<tenant>.dooray.com/wiki/<wikiId>/<pageId>"
```

`<tenant>` 는 placeholder 로 둔다.

### 6. 공개 문서 검사를 이 phase 의 테스트로 돌린다

이 phase 는 코드를 바꾸지 않으므로 검사가 이 phase 의 완료 판정이다.

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
bash ~/.claude/scripts/korean-style-check.sh README.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md
python3 ~/.claude/scripts/check-readability.py README.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md
```

넷 다 종료 코드 0 이어야 한다.

## 검증

```bash
# cwd: <repo root>
bash scripts/check-public-refs.sh
bash scripts/check-pii.sh
pnpm test
```

문서에 적은 명령이 실제로 동작하는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js wiki list --help | grep -- "--search"
node dist/index.js wiki page get --help | grep -- "--url"
```

두 grep 이 모두 걸려야 한다. 걸리지 않으면 phase 01 이나 02 가 덜 끝난 것이다.

문서에 내부 참조가 남지 않았는지 직접 본다.

```bash
# cwd: <repo root>
grep -nE "ADR-[0-9]{3}|Issue #[0-9]+|task [0-9]+" README.md skills/dooray-cli/SKILL.md skills/dooray-cli/references/wiki.md
```

아무 줄도 나오지 않아야 한다.

## plan 완료 마킹

이 plan 의 마지막 phase 다. 위 검증을 모두 통과시킨 뒤 `index.json` 을 고치고,
**이 phase 의 단일 commit 에 그 변경을 함께 넣는다.** 별도 commit 이나 amend 로 미루지 않는다.

```bash
# cwd: <repo root>
PLAN=tasks/plan059-feat-wiki-name-search-and-input-hints
sed -i '' 's/"status": "pending"/"status": "completed"/g' $PLAN/index.json
sed -i '' 's/"current_phase": 1/"current_phase": 4/' $PLAN/index.json
grep -c '"status": "completed"' $PLAN/index.json     # = 5 (최상위 1 + phase 4)
grep -c '"current_phase": 4' $PLAN/index.json        # = 1
```

두 기대값이 맞아야 한다. `phases` 배열 항목에 `status` 키가 없으면 먼저 각 항목에 `"status": "completed"` 를 넣는다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/dooray-cli/references/wiki.md` | 수정 |
| `skills/dooray-cli/SKILL.md` | 수정 |
| `README.md` | 수정 |
| `tasks/plan059-feat-wiki-name-search-and-input-hints/index.json` | 수정 |
