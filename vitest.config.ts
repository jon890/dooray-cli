import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // Orca 가 워크트리를 저장소 루트의 `worktrees/` 아래에 만든다.
    // 기본 exclude 에 그 경로가 없어 다른 브랜치의 테스트가 함께 잡힌다.
    // 실측으로 파일 54개가 108개, 테스트 551건이 1102건으로 두 배가 됐다.
    // 그 상태에서는 현재 브랜치의 통과 판정에 다른 브랜치의 결과가 섞인다.
    //
    // 배열을 그대로 지정하면 기본값을 교체한다. spread 로 확장해 기본을 남긴다.
    exclude: [...configDefaults.exclude, "worktrees/**"],
  },
});
