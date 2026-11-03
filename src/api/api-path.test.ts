import { describe, expect, it, vi } from "vitest";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { DoorayCliError } from "../utils/errors.js";
import { apiPath } from "./api-path.js";
import { DoorayApiClient } from "./client.js";
import { buildThreadRequest } from "./messenger-thread-request.js";

// 경로에 들어가는 id 가 모두 인코딩되는지 확인한다 (ADR-075).
const HOSTILE = "a/b?c#d";
const ENCODED = "a%2Fb%3Fc%23d";

describe("apiPath", () => {
  it("끼워 넣은 값만 인코딩하고 고정 부분은 그대로 둔다", () => {
    expect(apiPath`project/v1/projects/${HOSTILE}/posts/${"1"}`).toBe(
      `project/v1/projects/${ENCODED}/posts/1`,
    );
  });

  it("숫자 id 는 인코딩해도 그대로다", () => {
    expect(apiPath`project/v1/projects/${"1234567890"}/posts/${42}`).toBe(
      "project/v1/projects/1234567890/posts/42",
    );
  });

  it("값이 없으면 고정 문자열을 그대로 낸다", () => {
    expect(apiPath`common/v1/members/me`).toBe("common/v1/members/me");
  });

  it.each(["", ".", ".."])("%j 는 파라미터 오류로 거부한다", (value) => {
    let err: unknown;
    try {
      apiPath`project/v1/projects/${value}/posts/1`;
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DoorayCliError);
    expect((err as DoorayCliError).exitCode).toBe(EXIT_PARAM_ERROR);
    expect((err as Error).message).toContain(JSON.stringify(value));
  });

  it("`..` 가 섞였지만 그 자체는 아닌 값은 통과한다", () => {
    expect(apiPath`posts/${"a..b"}/${"..a"}/${"a."}`).toBe("posts/a..b/..a/a.");
  });
});

function clientWithSpy() {
  const c = new DoorayApiClient("key", "https://api.dooray.com");
  const json = vi.fn(() => Promise.resolve({ result: {} }));
  const call = vi.fn(() => ({ json }));
  (c as unknown as { api: unknown }).api = { get: call, post: call, put: call, delete: call };
  return { c, call };
}

describe("client 의 경로", () => {
  it.each([
    ["getPost", (c: DoorayApiClient) => c.getPost(HOSTILE, HOSTILE), `project/v1/projects/${ENCODED}/posts/${ENCODED}`],
    ["getPostComment", (c: DoorayApiClient) => c.getPostComment(HOSTILE, HOSTILE, HOSTILE), `project/v1/projects/${ENCODED}/posts/${ENCODED}/logs/${ENCODED}`],
    ["deletePostFile", (c: DoorayApiClient) => c.deletePostFile(HOSTILE, HOSTILE, HOSTILE), `project/v1/projects/${ENCODED}/posts/${ENCODED}/files/${ENCODED}`],
    ["getWikiPage", (c: DoorayApiClient) => c.getWikiPage(HOSTILE, HOSTILE), `wiki/v1/wikis/${ENCODED}/pages/${ENCODED}`],
    ["sendChannelMessage", (c: DoorayApiClient) => c.sendChannelMessage(HOSTILE, "hi"), `messenger/v1/channels/${ENCODED}/logs`],
    ["getCalendarEvent", (c: DoorayApiClient) => c.getCalendarEvent(HOSTILE, HOSTILE), `calendar/v1/calendars/${ENCODED}/events/${ENCODED}`],
  ])("%s 는 /·?·# 가 섞인 id 를 인코딩해 부른다", async (_name, run, expected) => {
    const { c, call } = clientWithSpy();
    await run(c).catch(() => undefined);
    expect((call.mock.calls[0] as unknown[])[0]).toBe(expected);
  });

  it("스레드 생성 경로도 channelId 와 logId 를 인코딩한다", () => {
    expect(buildThreadRequest(HOSTILE, "t", { logId: HOSTILE }).path).toBe(
      `messenger/v1/channels/${ENCODED}/logs/${ENCODED}/threads/create-and-send`,
    );
  });
});
