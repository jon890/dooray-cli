import { describe, it, expect, vi } from "vitest";

// cache/store 모킹 — ensureTemplates 가 항상 fetchAllTemplates 를 거치도록
vi.mock("../cache/store.js", () => ({
  getTemplates: vi.fn().mockResolvedValue(null),
  setTemplates: vi.fn().mockResolvedValue(undefined),
  isExpired: vi.fn().mockReturnValue(true),
}));

import { resolveTemplate } from "./template.js";
import type { DoorayApiClient } from "../api/client.js";
import { DoorayCliError } from "../utils/errors.js";

function mockClient(opts: { getProjectTemplates?: any }): DoorayApiClient {
  return {
    getProjectTemplates:
      opts.getProjectTemplates ??
      vi.fn().mockResolvedValue({ result: [], totalCount: 0 }),
  } as unknown as DoorayApiClient;
}

describe("resolveTemplate", () => {
  it("15자리 이상 숫자 → 그대로 반환 + API 호출 0", async () => {
    const fn = vi.fn();
    expect(
      await resolveTemplate(mockClient({ getProjectTemplates: fn }), "<project>", "1234567890123456789"),
    ).toBe("1234567890123456789");
    expect(fn).not.toHaveBeenCalled();
  });

  it("이름 부분일치 1건 → id 반환", async () => {
    const client = mockClient({
      getProjectTemplates: vi.fn().mockResolvedValue({
        result: [
          { id: "9876543210987654321", templateName: "주간 릴리스 체크", project: { id: "p1", code: "proj" } },
        ],
        totalCount: 1,
      }),
    });
    expect(await resolveTemplate(client, "<project>", "주간")).toBe("9876543210987654321");
  });

  it("이름 부분일치 0건 → DoorayCliError throw", async () => {
    const client = mockClient({
      getProjectTemplates: vi.fn().mockResolvedValue({
        result: [
          { id: "9876543210987654321", templateName: "주간 릴리스 체크", project: { id: "p1", code: "proj" } },
        ],
        totalCount: 1,
      }),
    });
    await expect(resolveTemplate(client, "<project>", "존재하지않는템플릿")).rejects.toThrow(DoorayCliError);
  });

  it("이름 부분일치 2건 이상 → 모호 에러 + DoorayCliError throw", async () => {
    const client = mockClient({
      getProjectTemplates: vi.fn().mockResolvedValue({
        result: [
          { id: "1111111111111111111", templateName: "주간 릴리스 A", project: { id: "p1", code: "proj" } },
          { id: "2222222222222222222", templateName: "주간 릴리스 B", project: { id: "p1", code: "proj" } },
        ],
        totalCount: 2,
      }),
    });
    await expect(resolveTemplate(client, "<project>", "주간")).rejects.toThrow(DoorayCliError);
  });
});
