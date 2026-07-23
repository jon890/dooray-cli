import { afterEach, describe, expect, it, vi } from "vitest";
import { homedir } from "node:os";
import path from "node:path";
import {
  createSkillManagerContext,
  resolveSkillDataRoot,
} from "./context.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveSkillDataRoot", () => {
  it("uses absolute XDG_DATA_HOME before the home fallback", () => {
    const homeDir = path.join(path.sep, "home", "user");
    const xdgDataHome = path.join(path.sep, "xdg", "data");

    expect(resolveSkillDataRoot(homeDir, xdgDataHome)).toBe(
      path.join(xdgDataHome, "dooray-cli"),
    );
  });

  it("falls back to homeDir when XDG_DATA_HOME is unset or relative", () => {
    const homeDir = path.join(path.sep, "home", "user");
    const fallback = path.join(homeDir, ".local", "share", "dooray-cli");

    expect(resolveSkillDataRoot(homeDir, undefined)).toBe(fallback);
    expect(resolveSkillDataRoot(homeDir, "relative-data")).toBe(fallback);
  });
});

describe("createSkillManagerContext", () => {
  it("injects dataRoot from absolute XDG_DATA_HOME", () => {
    const xdgDataHome = path.join(path.sep, "tmp", "xdg-data");
    vi.stubEnv("XDG_DATA_HOME", xdgDataHome);

    expect(createSkillManagerContext()).toMatchObject({
      homeDir: homedir(),
      dataRoot: path.join(xdgDataHome, "dooray-cli"),
    });
  });

  it("injects the home fallback when XDG_DATA_HOME is relative or unset", () => {
    const fallback = path.join(homedir(), ".local", "share", "dooray-cli");

    vi.stubEnv("XDG_DATA_HOME", "relative-data");
    expect(createSkillManagerContext().dataRoot).toBe(fallback);

    vi.stubEnv("XDG_DATA_HOME", undefined);
    expect(createSkillManagerContext().dataRoot).toBe(fallback);
  });
});
