---
id: required-input-empty-early-return-exit-zero
category: code-review
title: "필수 입력 빈 값을 조기 return, stdout 안내로 처리 (exit 0 오인)"
triggers: [빈 본문, empty body, exit code, EXIT_PARAM_ERROR, 조기 return, stdout, $EDITOR fallback]
tool_catchable: true
source: [PR #100]
related: [empty-result-to-stderr, resolver-before-editor]
---

**증상**: 필수 입력(본문 등)이 비었을 때 `process.stdout.write(안내) + return` 으로 처리.
세 가지 회귀:

- exit 0 으로 정상 종료 → `cmd && echo OK` 자동화가 성공으로 오인.
- 에러 안내가 stdout 으로 나감 → `데이터=stdout / 에러=stderr` 컨벤션 위반 (`--json` 파이프 파서 오염).
- 검증이 `$EDITOR` fallback 분기 안에만 있어 `--body ""` / 빈 `--body-file` 로 우회 → 빈 값 그대로 API 전송.

**Good**: 검증을 모든 입력 경로 뒤 공통 지점으로 승격, `throw new DoorayCliError(msg, EXIT_PARAM_ERROR)`.

```ts
let bodyContent = await readBodyInputOrNull(opts);
if (bodyContent == null) {
  bodyContent = await openInEditor("");
}
if (!bodyContent.trim()) {
  throw new DoorayCliError("빈 메시지는 전송할 수 없습니다.", EXIT_PARAM_ERROR);
}
```

**검출**: `grep -rnE 'stdout\.write.*\\n"\)?;?\s*$' src/commands/` 로 안내 후 `return` 조합 의심.
또는 `grep -rnB2 'return;' src/commands/ | grep -i 'stdout.write'`.

**Why**: 필수 입력 미충족은 정상 종료가 아니라 파라미터 오류다.
`empty-result-to-stderr`(정상 빈 결과를 stderr 로 보내는 반대 실수)와 짝 — 빈 값이 "정상 결과"인지 "입력 오류"인지 구분해 각각 stdout·무출력 / throw 로 처리한다.
검증은 반드시 모든 입력 소스(옵션·파일·$EDITOR)가 합류한 뒤 한 곳에서.
