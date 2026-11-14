import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  // tsconfig.json 의 paths(`@/…`)를 테스트와 vi.mock 에서도 같은 모듈로 푼다 (ADR-082).
  resolve: { tsconfigPaths: true },
  test: {
    // git worktree 를 만드는 폴더를 테스트 대상에서 제외한다.
    exclude: [...configDefaults.exclude, "worktrees/**"],
  },
});
