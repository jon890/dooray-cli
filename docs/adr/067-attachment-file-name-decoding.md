## ADR-067: 첨부 다운로드는 `Content-Disposition` 파일명을 풀어 쓰고 저장 파일명을 직접 정할 수 있다

- **status**: `accepted`

- **결정**: 업무·댓글·위키 첨부 다운로드의 저장 이름을 `src/utils/content-disposition.ts` 한 곳에서 정한다.
  `downloadPostFile` 과 `downloadWikiPageFile` 이 같은 함수를 쓰고, 두 메서드가 돌려주는 `fileName` 은 이미 정리된 저장 이름이다.
  호출하는 명령은 `decodeURIComponent` 나 `basename` 을 다시 적용하지 않는다.

  디코딩 순서:
  1. `filename*` (RFC 5987) 이 있으면 그것만 쓴다. 문자셋을 읽어 바이트를 푼다.
  2. 없으면 `filename` 을 읽는다. 따옴표 안의 `;` 는 이름의 일부다.
  3. RFC 2047 encoded-word (`=?charset?Q?...?=`, `B`) 를 푼다. 인접한 단어 사이의 공백은 버린다.
  4. 퍼센트 인코딩을 푼다.
  5. 모든 문자가 Latin-1 범위이고 되돌린 바이트가 유효한 UTF-8 일 때만 Latin-1 mojibake 를 복원한다.
  6. NFC 로 정규화하고 `basename` 으로 경로를 떼고 제어 문자를 지운다.

  **풀지 못했거나 결과가 255바이트(UTF-8)를 넘으면 대체 이름을 쓴다.**
  순서는 목록의 `name`(NFC) → `<fileId>.<ext>` → `<fileId>` 다. `<ext>` 는 헤더에 남은 원본 이름의 확장자다.
  대체에 쓰는 목록 이름도 같은 검사를 거친다.
  목록은 디코딩에 실패했을 때만 조회한다. 정상 경로의 호출 수는 늘지 않는다.
  `download-all` 은 이미 가진 목록 이름을 넘겨 추가 조회가 없다.

  **단일 파일 다운로드 세 명령에 `--output-file <path>` 를 둔다.**
  `post file download`, `post comment file download`, `wiki page file download` 가 대상이다. `download-all` 에는 두지 않는다.
  - 그 경로로 저장하며, 부모 디렉터리가 없으면 만든다.
  - 기존 디렉터리이거나 `/` 로 끝나면 종료 코드 3 으로 거절한다.
  - 디렉터리 옵션(`-o, --output` 또는 `--out`)을 함께 명시하면 `--output-file` 이 이기고, 디렉터리 옵션을 무시한다는 경고를 stderr 로 낸다.
  - `--json` 의 `fileName` 은 `outputPath` 의 basename 이다.
  - 디렉터리 옵션 이름이 명령마다 다른 것은 이번에 정리하지 않는다.

- **맥락**: `fetch`(undici)는 응답 헤더 바이트를 Latin-1 로 읽는다.
  서버가 UTF-8 바이트를 그대로 실으면 헤더 문자열이 mojibake 로 돌아온다. 로컬 서버로 재현해 확인했다.
  업무 첨부는 이름이 깨진 채 저장됐다. 위키는 NFD 자모가 encoded-word 로 실려 디코딩 없이 파일명으로 쓰이면서 `ENAMETOOLONG` 이 났다.
  기존 코드는 정규식으로 뽑은 값에 `decodeURIComponent` 만 적용했다.

- **대안 기각**:
  - **항상 목록 `name` 을 쓴다** — 다운로드마다 목록 조회가 늘고, 댓글 첨부는 업무 첨부 목록에 없을 수 있다.
  - **mojibake 를 보이면 무조건 되돌린다** — 진짜 Latin-1 이름(`café`)이 깨진다. 유효한 UTF-8 일 때만 복원한다.
  - **`--output` 을 파일 경로로 바꾼다** — 기존 호출이 깨진다.

- **결과**:
  - 얻는 것: 한글 이름이 서버 목록의 이름과 같게 NFC 로 저장된다. 이름이 길거나 깨져도 저장은 실패하지 않는다.
  - 감당할 것: 저장 이름이 종전과 달라져, 깨진 이름을 전제로 한 자동화는 결과가 바뀐다.
    같은 이름의 파일은 덮어쓴다(종전과 같다). 문자셋을 모르는 encoded-word 는 대체 이름으로 간다.

- **적용 범위**: `src/utils/content-disposition.ts`, `src/utils/download-target.ts`, `src/api/client.ts` 의 업무·위키 다운로드 메서드와 그 메서드를 쓰는 다운로드 명령.
  `--json` 출력 스키마는 [ADR-031](031-file-json-output-schema.md) 을 그대로 쓴다.
