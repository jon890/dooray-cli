---
id: RETRO-0017
plan: plan058-fix-config-change-cache-invalidation
date: 2026-08-20
phase: 계획 평가
status: 해결
category: 계획
promotion: 승격 후보
---

# 선례를 따르라는 지시가 의존 형태의 차이를 흡수하지 못했다

## 관찰

계획의 테스트 항목이 "mock 은 `src/services/tag.test.ts` 의 방식을 그대로 쓴다" 라고만 적었다.
`tag.test.ts` 는 `../cache/store.js` 하나만 mock 한다.

그대로 따랐으면 `src/services/config.test.ts` 가 `../config/store.js` 를 덮지 않았을 것이고,
`pnpm test` 가 `setConfigValue` 와 `saveConfig` 를 통해 사용자의 실제 `~/.dooray/config.json` 을 테스트 fixture 로 덮어썼을 것이다.

## 원인

두 파일의 의존 형태가 다르다.

`src/services/tag.ts` 는 `DoorayApiClient` 를 **인자로 받는다**.
그래서 테스트가 가짜 client 객체를 넘기면 되고, mock 할 모듈은 캐시 쪽 하나뿐이다.

`src/services/config.ts` 는 주입을 받지 않고 `src/config/store.ts` 를 직접 부른다.
같은 계열이라는 이유로 mock 범위까지 같다고 볼 근거가 없었다.

## 영향

코드를 쓰기 전에 잡혀서 실제 피해는 없었다.
계획 검토를 건너뛰었다면 첫 `pnpm test` 실행에서 사용자의 설정이 날아갔을 것이고,
테스트는 통과했을 것이라 원인을 찾기 어려웠을 것이다.

## 대응

계획의 테스트 항목에 mock 대상을 표로 명시했다.
`../config/store.js` 의 `getConfig`·`setConfigValue`·`saveConfig` 셋과 `../cache/store.js` 의 `clearCache` 다.
선례를 삼되 mock 대상은 그대로 베끼지 않는다는 이유도 함께 적었다.

검증에 테스트 전후 `~/.dooray/config.json` 해시 비교를 넣었다.

## 검증

`pnpm test` 전후로 config 해시가 같았고 캐시 파일 수도 그대로였다.
`vi.mock` 두 줄이 모두 있는 것을 `grep` 으로 확인했다.

## 배운 점

"기존 방식을 따르라" 는 지시는 대상과 선례의 의존 형태가 같을 때만 안전하다.
선례가 의존을 **주입받는지** 아니면 **직접 부르는지**가 mock 범위를 정한다.
계획에 선례를 적을 때는 그 축이 같은지 확인하고, 다르면 mock 대상을 이름으로 나열한다.

테스트가 사용자의 홈 디렉터리를 건드릴 수 있는 모듈을 부르면
검증에 파일 해시 대조를 넣어 그 사실이 조용히 넘어가지 않게 한다.

## 후속

`docs/pitfalls/plan/test-self-mock.md` 는 자기 자신을 mock 하는 축만 막고 이 축은 덮지 못한다.
회피 패턴 하나로 승격할 후보로 남긴다. 검출은 아래로 가능하다.

```bash
# cwd: <repo root>
# 테스트 대상이 직접 부르는 모듈 중 mock 되지 않은 것을 찾는다
for f in src/services/*.test.ts; do
  target="${f%.test.ts}.ts"
  grep -oE 'from "\.\./[a-z-]+/[a-z-]+\.js"' "$target" | sort -u | while read -r imp; do
    mod=$(echo "$imp" | sed 's/from "//; s/"//')
    grep -q "vi.mock(\"$mod\"" "$f" || echo "$f: $mod 미 mock"
  done
done
```
