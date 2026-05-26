import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  emitDownloadResult,
  emitDownloadAllResult,
  emitDeleteResult,
  type DownloadResult,
  type DownloadAllResult,
  type DeleteResult,
} from "./file-output.js";

// --- helpers ---

function captureStdout(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((s: string | Uint8Array) => {
    writes.push(String(s));
    return true;
  });
  return {
    writes,
    restore: () => spy.mockRestore(),
  };
}

// --- emitDownloadResult ---

const downloadFixture: DownloadResult = {
  outputPath: "/tmp/report.pdf",
  fileName: "report.pdf",
  size: 12345,
};

describe("emitDownloadResult", () => {
  afterEach(() => vi.restoreAllMocks());

  it("--json 모드 — { outputPath, fileName, size } JSON 출력", () => {
    const { writes, restore } = captureStdout();
    emitDownloadResult({ json: true }, downloadFixture);
    restore();
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.outputPath).toBe("/tmp/report.pdf");
    expect(parsed.fileName).toBe("report.pdf");
    expect(parsed.size).toBe(12345);
  });

  it("--quiet 모드 — outputPath 한 줄 출력", () => {
    const { writes, restore } = captureStdout();
    emitDownloadResult({ quiet: true }, downloadFixture);
    restore();
    expect(writes.join("").trim()).toBe("/tmp/report.pdf");
  });

  it("plain 모드 — outputPath 한 줄 출력", () => {
    const { writes, restore } = captureStdout();
    emitDownloadResult({}, downloadFixture);
    restore();
    expect(writes.join("").trim()).toBe("/tmp/report.pdf");
  });
});

// --- emitDownloadAllResult ---

const downloadAllFixture: DownloadAllResult = {
  count: 3,
  succeeded: [
    { path: "/tmp/a.pdf", fileName: "a.pdf" },
    { path: "/tmp/b.png", fileName: "b.png" },
  ],
  failed: [{ fileId: "f001", error: "timeout" }],
};

describe("emitDownloadAllResult", () => {
  afterEach(() => vi.restoreAllMocks());

  it("--json 모드 — { count, succeeded, failed } JSON 출력", () => {
    const { writes, restore } = captureStdout();
    emitDownloadAllResult({ json: true }, downloadAllFixture);
    restore();
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.count).toBe(3);
    expect(parsed.succeeded).toHaveLength(2);
    expect(parsed.failed).toHaveLength(1);
    expect(parsed.failed[0].fileId).toBe("f001");
  });

  it("--quiet 모드 — succeeded 경로 한 줄씩 출력", () => {
    const { writes, restore } = captureStdout();
    emitDownloadAllResult({ quiet: true }, downloadAllFixture);
    restore();
    const lines = writes.join("").split("\n").filter(Boolean);
    expect(lines).toEqual(["/tmp/a.pdf", "/tmp/b.png"]);
  });

  it("plain 모드 — 완료 요약 출력", () => {
    const { writes, restore } = captureStdout();
    emitDownloadAllResult({}, downloadAllFixture);
    restore();
    expect(writes.join("")).toContain("완료: 2/3");
  });

  it("--json 모드, 빈 결과 — { count: 0, succeeded: [], failed: [] }", () => {
    const { writes, restore } = captureStdout();
    emitDownloadAllResult({ json: true }, { count: 0, succeeded: [], failed: [] });
    restore();
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.count).toBe(0);
    expect(parsed.succeeded).toHaveLength(0);
    expect(parsed.failed).toHaveLength(0);
  });
});

// --- emitDeleteResult ---

const deleteFixture: DeleteResult = { fileId: "abc123" };

describe("emitDeleteResult", () => {
  afterEach(() => vi.restoreAllMocks());

  it("--json 모드 — { fileId, status: 'deleted' } JSON 출력", () => {
    const { writes, restore } = captureStdout();
    emitDeleteResult({ json: true }, deleteFixture);
    restore();
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.fileId).toBe("abc123");
    expect(parsed.status).toBe("deleted");
  });

  it("--quiet 모드 — fileId 한 줄 출력", () => {
    const { writes, restore } = captureStdout();
    emitDeleteResult({ quiet: true }, deleteFixture);
    restore();
    expect(writes.join("").trim()).toBe("abc123");
  });

  it("plain 모드 — 삭제 확인 메시지 출력", () => {
    const { writes, restore } = captureStdout();
    emitDeleteResult({}, deleteFixture);
    restore();
    expect(writes.join("")).toContain("abc123");
    expect(writes.join("")).toContain("삭제");
  });
});
