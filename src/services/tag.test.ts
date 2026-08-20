import { describe, it, expect, vi, beforeEach } from "vitest";

// cache/store 모킹 — clearTags 호출 여부와 실패 처리를 관찰한다
vi.mock("../cache/store.js", () => ({
  clearTags: vi.fn().mockResolvedValue(undefined),
}));

import { createTag, updateTagGroup } from "./tag.js";
import { clearTags } from "../cache/store.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";
import type { DoorayApiClient } from "../api/client.js";

const mockedClearTags = vi.mocked(clearTags);

function okClient(): DoorayApiClient {
  return {
    createProjectTag: vi.fn().mockResolvedValue({ result: { id: "1111111111111111111" } }),
    updateProjectTagGroup: vi.fn().mockResolvedValue({ result: null }),
  } as unknown as DoorayApiClient;
}

/** api/client 의 throw path 는 toDoorayCliError 를 거쳐 EXIT_API_ERROR 를 단다 */
function apiError(): DoorayCliError {
  return new DoorayCliError("API 호출 실패: 잘못된 요청입니다", EXIT_API_ERROR);
}

/** clearTags 는 node:fs 의 rm 을 부르므로 실패하면 raw Error 가 올라온다 */
function fsError(): Error {
  return Object.assign(new Error("EACCES: permission denied, unlink"), { code: "EACCES" });
}

describe("createTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedClearTags.mockResolvedValue(undefined);
  });

  it("성공하면 태그 id 를 돌려주고 그 프로젝트의 캐시를 지운다", async () => {
    const client = okClient();
    const id = await createTag(client, "<projectId>", { name: "배포환경:staging", color: "c6eab3" });
    expect(id).toBe("1111111111111111111");
    expect(mockedClearTags).toHaveBeenCalledWith("<projectId>");
  });

  it("캐시 삭제가 실패해도 정상 반환한다", async () => {
    const client = okClient();
    mockedClearTags.mockRejectedValue(fsError());
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await expect(createTag(client, "<projectId>", { name: "긴급", color: "e0e0e0" })).resolves.toBe(
        "1111111111111111111",
      );
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("API 호출이 실패하면 그대로 던지고 캐시를 지우지 않는다", async () => {
    const client = {
      createProjectTag: vi.fn().mockRejectedValue(apiError()),
    } as unknown as DoorayApiClient;
    await expect(createTag(client, "<projectId>", { name: "긴급", color: "e0e0e0" })).rejects.toMatchObject(
      { exitCode: EXIT_API_ERROR },
    );
    expect(mockedClearTags).not.toHaveBeenCalled();
  });
});

describe("updateTagGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedClearTags.mockResolvedValue(undefined);
  });

  it("성공하면 그 프로젝트의 캐시를 지운다", async () => {
    const client = okClient();
    await updateTagGroup(client, "<projectId>", "<groupId>", { mandatory: true, selectOne: false });
    expect(mockedClearTags).toHaveBeenCalledWith("<projectId>");
  });

  it("캐시 삭제가 실패해도 정상 반환한다", async () => {
    const client = okClient();
    mockedClearTags.mockRejectedValue(fsError());
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await expect(
        updateTagGroup(client, "<projectId>", "<groupId>", { mandatory: true, selectOne: false }),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("API 호출이 실패하면 그대로 던지고 캐시를 지우지 않는다", async () => {
    const client = {
      updateProjectTagGroup: vi.fn().mockRejectedValue(apiError()),
    } as unknown as DoorayApiClient;
    await expect(
      updateTagGroup(client, "<projectId>", "<groupId>", { mandatory: true, selectOne: false }),
    ).rejects.toMatchObject({ exitCode: EXIT_API_ERROR });
    expect(mockedClearTags).not.toHaveBeenCalled();
  });
});
