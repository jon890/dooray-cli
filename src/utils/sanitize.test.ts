import { describe, expect, it } from "vitest";
import { sanitizeForTerminal, sanitizeMultilineForTerminal } from "./sanitize.js";

// ANSI escape 시작 바이트. 리터럴로 두면 편집기에서 보이지 않아 escape 표기로 쓴다.
const ESC = "\u001b";

describe("sanitizeForTerminal", () => {
  it("줄바꿈을 포함한 control char 를 모두 ? 로 바꾼다", () => {
    expect(sanitizeForTerminal(`a\nb${ESC}[31m\x7F`)).toBe("a?b?[31m?");
  });
});

describe("sanitizeMultilineForTerminal", () => {
  it("줄바꿈은 살린다", () => {
    expect(sanitizeMultilineForTerminal("첫째\n둘째\n")).toBe("첫째\n둘째\n");
  });

  it("CRLF 는 LF 로 접는다", () => {
    expect(sanitizeMultilineForTerminal("첫째\r\n둘째")).toBe("첫째\n둘째");
  });

  it("홀로 선 CR 과 탭, ESC, DEL 은 ? 로 바꾼다", () => {
    expect(sanitizeMultilineForTerminal(`덮어\r쓰기\t${ESC}[2J\x7F`)).toBe("덮어?쓰기??[2J?");
  });

  it("옵션 없이 부르면 종전 동작과 같다", () => {
    expect(sanitizeMultilineForTerminal("a\tb\r\nc\rd", {})).toBe("a?b\nc?d");
  });

  it("keepTab 이면 탭을 그대로 둔다", () => {
    expect(sanitizeMultilineForTerminal(`a\tb${ESC}`, { keepTab: true })).toBe("a\tb?");
  });

  it("crMarker 를 주면 CR 을 접거나 ? 로 바꾸지 않고 표기로 바꾼다", () => {
    expect(sanitizeMultilineForTerminal("a\r\nb\rc", { crMarker: "<CR>" })).toBe("a<CR>\nb<CR>c");
  });
});
