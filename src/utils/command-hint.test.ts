import { describe, it, expect } from "vitest";
import { shellQuote, buildIdModeCommand } from "./command-hint.js";

const POST_ID = "1234567890123456789";

describe("shellQuote", () => {
  it("안전한 문자만으로 된 토큰은 그대로 둔다", () => {
    expect(shellQuote("post")).toBe("post");
    expect(shellQuote("--body-file")).toBe("--body-file");
    expect(shellQuote("./body.md")).toBe("./body.md");
    expect(shellQuote("my-project")).toBe("my-project");
    expect(shellQuote("--body=x")).toBe("--body=x");
    expect(shellQuote("user@example.com")).toBe("user@example.com");
    expect(shellQuote("https://x.dooray.com/task/to/1")).toBe(
      "https://x.dooray.com/task/to/1",
    );
    expect(shellQuote(POST_ID)).toBe(POST_ID);
  });

  it("공백이 든 값은 단일 인용부호로 감싼다", () => {
    expect(shellQuote("hello world")).toBe("'hello world'");
  });

  it("단일 인용부호가 든 값은 '\\'' 로 바꾼다", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'");
  });

  it("셸 특수문자가 든 값을 감싼다", () => {
    expect(shellQuote("a;rm -rf /")).toBe("'a;rm -rf /'");
    expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
    expect(shellQuote("a|b")).toBe("'a|b'");
    expect(shellQuote("*")).toBe("'*'");
    expect(shellQuote("한글 제목")).toBe("'한글 제목'");
  });

  it("빈 문자열은 빈 인용부호가 된다", () => {
    expect(shellQuote("")).toBe("''");
  });
});

describe("buildIdModeCommand", () => {
  it("positional 을 빼고 --id 를 붙인다", () => {
    const argv = [
      "post",
      "comment",
      "add",
      "my-project",
      POST_ID,
      "--body-file",
      "./body.md",
    ];
    expect(buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID)).toBe(
      `dooray post comment add --body-file ./body.md --id ${POST_ID}`,
    );
  });

  it("옵션 값이 positional 과 같은 문자열이면 옵션 값 쪽을 유지한다", () => {
    const argv = ["post", "get", "my-project", "337", "--body-file", "337"];
    expect(buildIdModeCommand(argv, ["my-project", "337"], "337")).toBe(
      "dooray post get --body-file 337 --id 337",
    );
  });

  it("값 없는 flag 가 positional 앞에 와도 positional 을 뺀다", () => {
    const argv = [
      "post",
      "comment",
      "add",
      "--dry-run",
      "my-project",
      POST_ID,
      "--body",
      "x",
    ];
    const out = buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID);
    expect(out).toBe(
      `dooray post comment add --dry-run --body x --id ${POST_ID}`,
    );
    expect(out).not.toContain("my-project");
  });

  it("전역 flag 가 positional 앞에 연달아 와도 옵션 값 짝이 어긋나지 않는다", () => {
    const argv = [
      "post",
      "get",
      "--json",
      "--quiet",
      "my-project",
      POST_ID,
    ];
    expect(buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID)).toBe(
      `dooray post get --json --quiet --id ${POST_ID}`,
    );
  });

  it("--opt=value 는 한 토큰으로 유지하고 다음 토큰을 건너뛰지 않는다", () => {
    const argv = ["post", "get", "--json=true", "my-project", POST_ID];
    expect(buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID)).toBe(
      `dooray post get --json=true --id ${POST_ID}`,
    );
  });

  it("옵션 값에 공백이 있으면 인용한다", () => {
    const argv = ["post", "edit", "my-project", POST_ID, "--title", "hello world"];
    expect(buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID)).toBe(
      `dooray post edit --title 'hello world' --id ${POST_ID}`,
    );
  });

  it("옵션 값에 단일 인용부호가 있으면 '\\'' 로 바꿔 인용한다", () => {
    const argv = ["post", "edit", "my-project", POST_ID, "--title", "it's"];
    expect(buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID)).toBe(
      `dooray post edit --title 'it'\\''s' --id ${POST_ID}`,
    );
  });

  it("positional 이 하나뿐인 경우에도 동작한다", () => {
    const argv = ["post", "get", POST_ID];
    expect(buildIdModeCommand(argv, [POST_ID], POST_ID)).toBe(
      `dooray post get --id ${POST_ID}`,
    );
  });

  it("positionals 에 없는 비옵션 토큰은 남는다", () => {
    const argv = ["post", "comment", "file", "list", "my-project", POST_ID, "cmt-1"];
    expect(buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID)).toBe(
      `dooray post comment file list cmt-1 --id ${POST_ID}`,
    );
  });

  it("같은 값이 두 번 와도 positional 한 개만 지운다", () => {
    // project 코드와 하위 명령 뒤 인자가 같은 문자열인 경우
    const argv = ["post", "get", "337", "337"];
    expect(buildIdModeCommand(argv, ["337"], "337")).toBe(
      "dooray post get 337 --id 337",
    );
  });

  it("옵션이 argv 마지막에 오면 값 없이 유지한다", () => {
    const argv = ["post", "get", "my-project", POST_ID, "--json"];
    expect(buildIdModeCommand(argv, ["my-project", POST_ID], POST_ID)).toBe(
      `dooray post get --json --id ${POST_ID}`,
    );
  });

  it("positionals 가 비면 argv 전체를 유지하고 --id 만 붙인다", () => {
    const argv = ["post", "get", "--json"];
    expect(buildIdModeCommand(argv, [], POST_ID)).toBe(
      `dooray post get --json --id ${POST_ID}`,
    );
  });
});
