import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // git worktree 를 만드는 폴더를 테스트 대상에서 제외한다.
    exclude: [...configDefaults.exclude, "worktrees/**"],
  },
});
