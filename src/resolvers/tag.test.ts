import { describe, it, expect, vi, beforeEach } from "vitest";

// cache/store 모킹 — ensureTags 가 항상 fetchAllTags 를 거치도록
vi.mock("../cache/store.js", () => ({
  getTags: vi.fn().mockResolvedValue(null),
  setTags: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
}));

import { validateMandatoryTags } from "./tag.js";
import { DoorayCliError } from "../utils/errors.js";
import type { DoorayApiClient } from "../api/client.js";

type RawTag = {
  id: string;
  name: string;
  color?: string;
  tagGroup?: { id: string; name: string; mandatory: boolean; selectOne: boolean };
};

function mockClient(tags: RawTag[]): DoorayApiClient {
  return {
    getProjectTags: vi.fn().mockResolvedValue({ result: tags, totalCount: tags.length }),
  } as unknown as DoorayApiClient;
}

describe("validateMandatoryTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mandatory 그룹 0개면 throw 없이 통과", async () => {
    const client = mockClient([{ id: "1", name: "bug" }]);
    await expect(validateMandatoryTags(client, "<project>")).resolves.toBeUndefined();
  });

  it("mandatory 그룹 다중 — 메시지에 그룹별 후보 포함", async () => {
    const client = mockClient([
      { id: "1", name: "p0", tagGroup: { id: "g1", name: "priority", mandatory: true, selectOne: false } },
      { id: "2", name: "p1", tagGroup: { id: "g1", name: "priority", mandatory: true, selectOne: false } },
      { id: "3", name: "fix", tagGroup: { id: "g2", name: "type", mandatory: true, selectOne: false } },
    ]);
    await expect(validateMandatoryTags(client, "<project>")).rejects.toThrow(/p0|p1|fix/);
  });

  it("mandatory 그룹 에러는 DoorayCliError", async () => {
    const client = mockClient([
      { id: "1", name: "p0", tagGroup: { id: "g1", name: "priority", mandatory: true, selectOne: false } },
    ]);
    await expect(validateMandatoryTags(client, "<project>")).rejects.toBeInstanceOf(DoorayCliError);
  });

  it("groupId 없는 mandatory 태그는 무시 (false-positive 방지)", async () => {
    const client = mockClient([{ id: "1", name: "x" }]);
    // tagGroup 없으므로 groupId = null, groupMandatory = false → 무시
    await expect(validateMandatoryTags(client, "<project>")).resolves.toBeUndefined();
  });
});
