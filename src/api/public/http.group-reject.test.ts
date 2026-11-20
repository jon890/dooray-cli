import { HTTPError } from "ky";
import { describe, expect, it } from "vitest";
import { DoorayCliError } from "@/utils/errors.js";
import { EXIT_API_ERROR } from "@/utils/exit-codes.js";
import { toDoorayCliError } from "./http.js";

// 서버가 없는 그룹 ID 를 거부할 때 사용자가 서버 메시지를 그대로 읽을 수 있는지 본다. 실제 API 는 부르지 않는다.
describe("서버가 참조 그룹 ID 를 거부할 때의 오류", () => {
  it("서버의 거부 메시지를 API 호출 실패 뒤에 붙여 종료 코드 API 오류로 낸다", async () => {
    const response = new Response(
      JSON.stringify({ header: { isSuccessful: false, resultCode: -1, resultMessage: "존재하지 않는 그룹입니다" } }),
      { status: 400 },
    );
    const error = new HTTPError(response, new Request("https://example.com/x"), {} as never);

    const err = await toDoorayCliError(error).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DoorayCliError);
    expect(err).toMatchObject({
      exitCode: EXIT_API_ERROR,
      message: "API 호출 실패: 존재하지 않는 그룹입니다",
    });
  });
});
