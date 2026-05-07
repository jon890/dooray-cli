import { describe, it, expect, vi, beforeEach } from "vitest";
import { setQuiet, startSpinner, stopSpinner } from "./spinner.js";

describe("spinner quiet mode", () => {
  beforeEach(() => setQuiet(false));

  it("setQuiet(true) suppresses stderr output from startSpinner", () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    setQuiet(true);
    const s = startSpinner("test");
    expect(stderrWrite).not.toHaveBeenCalled();
    s.stop();
    stderrWrite.mockRestore();
  });

  it("noop proxy: text setter / stop() / succeed() / fail() 호출 안전", () => {
    setQuiet(true);
    const s = startSpinner("init");
    expect(() => {
      s.text = "updated";
      s.stop();
      s.succeed("ok");
      s.fail("nope");
    }).not.toThrow();
  });

  it("setQuiet(false) 복귀 후 정상 동작", () => {
    setQuiet(false);
    const s = startSpinner("normal");
    expect(s).toBeDefined();
    stopSpinner(true, "done");
  });
});
