import { describe, it, expect, vi, beforeEach } from "vitest";

// cache/store 모킹 — ensureTags 가 항상 fetchAllTags 를 거치도록
vi.mock("../cache/store.js", () => ({
  getTags: vi.fn().mockResolvedValue(null),
  setTags: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
}));

import { validateMandatoryTags, lookupTagIds, validateMandatoryCoverage } from "./tag.js";
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

describe("lookupTagIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mandatory 그룹 있는 fixture 에서도 throw 안 함 (mandatory skip)", async () => {
    // mandatory 그룹 있는 프로젝트에서 단순 name lookup — throw 하면 안 됨
    const client = mockClient([
      { id: "t1", name: "중요", tagGroup: { id: "g1", name: "분류", mandatory: true, selectOne: false } },
      { id: "t2", name: "보통", tagGroup: { id: "g1", name: "분류", mandatory: true, selectOne: false } },
    ]);
    await expect(lookupTagIds(client, "<project>", ["중요"])).resolves.toEqual(["t1"]);
  });

  it("빈 names 배열 → 빈 배열 반환", async () => {
    const client = mockClient([]);
    await expect(lookupTagIds(client, "<project>", [])).resolves.toEqual([]);
  });
});

describe("validateMandatoryCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mandatory 그룹 커버 시 통과", async () => {
    const client = mockClient([
      { id: "t1", name: "중요", tagGroup: { id: "g1", name: "분류", mandatory: true, selectOne: false } },
    ]);
    await expect(validateMandatoryCoverage(client, "<project>", ["t1"])).resolves.toBeUndefined();
  });

  it("mandatory 그룹 미충족 시 DoorayCliError throw", async () => {
    const client = mockClient([
      { id: "t1", name: "중요", tagGroup: { id: "g1", name: "분류", mandatory: true, selectOne: false } },
    ]);
    // "분류" 그룹의 태그가 selectedTagIds 에 없음
    await expect(validateMandatoryCoverage(client, "<project>", [])).rejects.toBeInstanceOf(DoorayCliError);
  });
});
