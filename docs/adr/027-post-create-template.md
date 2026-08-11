## ADR-027: `post create --template` 정책 — interpolation 기본 true + 사용자 옵션 우선 + `--field` 제외

**결정**: `dooray post create --template <name|id>` 사용 정책:
- `GET .../templates/{id}?interpolation=true` 로 시스템 매크로 (`${year}` 등) 치환된 본문/users/tags 를 받음
- 사용자가 `--title`/`--body`/`--tag`/`--to`/`--cc` 명시 입력하면 그 값이 템플릿 값을 override
- 사용자 정의 변수 (`--field key=value`) 는 본 task scope 제외 (별도 후속)

**맥락**: Issue #59 — 자동화 스크립트가 정형 task (릴리스 플랜, 요청서 등) 를 매번 기존 본문 fetch, 변수 치환 수동 우회.
Dooray API 가 `GET /templates` 와 `interpolation` 파라미터를 노출 (cmux-browser 사전 조사 2026-05-11 확인).

**대안 기각**:
- `interpolation=false` 기본 — 자동화 파이프라인이 `${year}` 같은 매크로를 매번 수동 치환해야 해서 가치 반감. UX 우선
- 템플릿 우선 (override 불가) — 사용자가 `--title` 까지 강제 변경 못 하면 "대부분 템플릿, 일부만 다르게" 자동화 패턴 불가
- 필드별 union (tags/users append, title/body override) — 정책 복잡. MVP 단순화 — 일관되게 사용자 옵션 우선
- `--field key=value` client-side string replace 포함 — 미정의 변수 / escape / type 처리 복잡.
  본 task 는 API 가 직접 제공하는 시스템 매크로만 사용, 사용자 정의 변수는 별도 task 로 분리

**적용 범위**: `post create --template` 만.
`post edit --template` 은 별도 — 기존 본문 덮어쓰기인지 merge 인지 의도 불명확.
templates 캐시는 ADR-004/010 동일 패턴 적용 (TTL 24h, `~/.dooray/cache/templates/{projectId}.json`).
