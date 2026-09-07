import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Orca 가 워크트리를 저장소 루트의 `worktrees/` 아래에 만든다.
    // 기본 exclude 에 그 경로가 없어 다른 브랜치의 테스트가 함께 잡힌다.
    // 실측으로 파일 54개가 108개, 테스트 551건이 1102건으로 두 배가 됐다.
    // 그 상태에서는 현재 브랜치의 통과 판정에 다른 브랜치의 결과가 섞인다.
    exclude: ["**/node_modules/**", "**/dist/**", "worktrees/**"],
  },
});
