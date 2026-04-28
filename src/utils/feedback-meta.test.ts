import { describe, it, expect } from "vitest";
import { buildIssueBody, collectMeta } from "./feedback-meta.js";

const FAKE_META = {
  cliVersion: "0.5.2",
  nodeVersion: "v18.20.4",
  os: "darwin",
  arch: "arm64",
};

describe("buildIssueBody", () => {
  it("환경 + 본문 섹션 포함", () => {
    const out = buildIssueBody("의견 내용", FAKE_META);
    expect(out).toContain("## 환경");
    expect(out).toContain("- dooray-cli 버전: 0.5.2");
    expect(out).toContain("- Node: v18.20.4");
    expect(out).toContain("- OS: darwin arm64");
    expect(out).toContain("## 사용자 피드백");
    expect(out).toContain("의견 내용");
  });

  it("baseUrl 미포함 (ADR-022)", () => {
    const out = buildIssueBody("의견", FAKE_META);
    expect(out).not.toMatch(/baseUrl|api\.dooray|https:\/\//);
  });

  it("apiKey/password 등 시크릿 키워드 미포함", () => {
    const out = buildIssueBody("의견", FAKE_META);
    expect(out.toLowerCase()).not.toMatch(/apikey|api[_-]?key|password|token|secret/);
  });

  it("사용자 본문이 trim 처리됨", () => {
    const out = buildIssueBody("\n\n  의견  \n\n", FAKE_META);
    expect(out).toContain("의견");
    expect(out).not.toMatch(/\n{4,}/);
  });
});

describe("collectMeta", () => {
  it("프로세스 정보로 채움", () => {
    const m = collectMeta("9.9.9");
    expect(m.cliVersion).toBe("9.9.9");
    expect(m.nodeVersion).toBe(process.version);
    expect(m.os).toBe(process.platform);
    expect(m.arch).toBe(process.arch);
  });

  it("config 객체에 접근하지 않음 (시그니처 검증)", () => {
    expect(collectMeta.length).toBe(1);
  });
});
