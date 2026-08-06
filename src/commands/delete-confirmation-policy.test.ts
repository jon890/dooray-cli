import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import {
  authorizeDeletion,
  promptDeletion,
} from "../utils/delete-confirmation.js";
import { getConfigOrThrow } from "../config/store.js";
import { resolvePostInput } from "../resolvers/post-input.js";
import { resolveCommentFileInput } from "../resolvers/comment-file-input.js";
import { resolveWikiPageInput } from "../resolvers/wiki-page-input.js";
import { fileDeleteCommand } from "./post/file/delete.js";
import { commentDeleteCommand } from "./post/comment/delete.js";
import { deleteCommentFileCommand } from "./post/comment/file/delete.js";
import { wikiPageDeleteCommand } from "./wiki/page-delete.js";
import { wikiPageFileDeleteCommand } from "./wiki/page-file/delete.js";
import { wikiPageCommentDeleteCommand } from "./wiki/page-comment/delete.js";

const { clientConstructor, deleteApi } = vi.hoisted(() => ({
  clientConstructor: vi.fn(),
  deleteApi: vi.fn(),
}));

vi.mock("../utils/delete-confirmation.js", () => ({
  authorizeDeletion: vi.fn(),
  promptDeletion: vi.fn(),
}));

vi.mock("../config/store.js", () => ({
  getConfigOrThrow: vi.fn(),
}));

vi.mock("../api/client.js", () => ({
  DoorayApiClient: class {
    deletePostComment = deleteApi;
    deletePostFile = deleteApi;
    deleteWikiPage = deleteApi;
    deleteWikiPageComment = deleteApi;
    deleteWikiPageFile = deleteApi;

    constructor(...args: unknown[]) {
      clientConstructor(...args);
    }
  },
}));

vi.mock("../resolvers/post-input.js", () => ({
  resolvePostInput: vi.fn(),
}));

vi.mock("../resolvers/comment-file-input.js", () => ({
  FILE_ID_SECONDARY_LABEL: "파일 ID",
  resolveCommentFileInput: vi.fn(),
}));

vi.mock("../resolvers/wiki-page-input.js", () => ({
  resolveWikiPageInput: vi.fn(),
}));

interface DeleteCommandCase {
  name: string;
  command: Command;
  args: string[];
}

const cases: DeleteCommandCase[] = [
  {
    name: "post file delete",
    command: fileDeleteCommand,
    args: ["my-project", "1", "file-1"],
  },
  {
    name: "post comment delete",
    command: commentDeleteCommand,
    args: ["my-project", "1", "comment-1"],
  },
  {
    name: "post comment file delete",
    command: deleteCommentFileCommand,
    args: ["my-project", "1", "comment-1", "file-1"],
  },
  {
    name: "wiki page delete",
    command: wikiPageDeleteCommand,
    args: ["my-project", "page-1"],
  },
  {
    name: "wiki page file delete",
    command: wikiPageFileDeleteCommand,
    args: ["my-project", "page-1", "file-1"],
  },
  {
    name: "wiki page comment delete",
    command: wikiPageCommentDeleteCommand,
    args: ["my-project", "page-1", "comment-1"],
  },
];

const mockedAuthorizeDeletion = vi.mocked(authorizeDeletion);
const mockedGetConfigOrThrow = vi.mocked(getConfigOrThrow);

function resetCommand(command: Command): void {
  command.setOptionValue("yes", undefined);
}

async function parse(commandCase: DeleteCommandCase, flag?: string): Promise<void> {
  resetCommand(commandCase.command);
  await commandCase.command.parseAsync([
    "node",
    "dooray",
    ...commandCase.args,
    ...(flag ? [flag] : []),
  ]);
}

function expectNoDeletionFlow(): void {
  expect(mockedGetConfigOrThrow).not.toHaveBeenCalled();
  expect(clientConstructor).not.toHaveBeenCalled();
  expect(resolvePostInput).not.toHaveBeenCalled();
  expect(resolveCommentFileInput).not.toHaveBeenCalled();
  expect(resolveWikiPageInput).not.toHaveBeenCalled();
  expect(deleteApi).not.toHaveBeenCalled();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe.each(cases)("$name", (commandCase) => {
  it("-y와 --yes 옵션을 함께 제공한다", () => {
    const yesOption = commandCase.command.options.find(
      (option) => option.long === "--yes",
    );

    expect(yesOption).toMatchObject({ short: "-y", long: "--yes" });
  });

  it.each(["-y", "--yes"])(
    "%s를 opts.yes=true로 공통 유틸리티에 전달한다",
    async (flag) => {
      const stopped = new Error("stop after confirmation boundary");
      mockedAuthorizeDeletion.mockRejectedValueOnce(stopped);

      await expect(parse(commandCase, flag)).rejects.toBe(stopped);

      expect(mockedAuthorizeDeletion).toHaveBeenCalledWith(
        true,
        !!process.stdin.isTTY,
        expect.any(Function),
      );
      expect(promptDeletion).not.toHaveBeenCalled();
      expectNoDeletionFlow();
    },
  );

  it("non-TTY 무플래그 오류에서는 설정과 삭제 흐름을 시작하지 않는다", async () => {
    mockedAuthorizeDeletion.mockRejectedValueOnce(
      new DoorayCliError("--yes(-y) 플래그가 필요합니다.", EXIT_PARAM_ERROR),
    );

    await expect(parse(commandCase)).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });

    expect(mockedAuthorizeDeletion).toHaveBeenCalledWith(
      false,
      !!process.stdin.isTTY,
      expect.any(Function),
    );
    expectNoDeletionFlow();
  });

  it("확인을 거절하면 stderr에만 취소를 알리고 삭제 흐름을 시작하지 않는다", async () => {
    mockedAuthorizeDeletion.mockResolvedValueOnce(false);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await parse(commandCase);

    expect(stderr).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith("취소되었습니다.\n");
    expect(stdout).not.toHaveBeenCalled();
    expectNoDeletionFlow();
  });

  it("확인을 승인하면 기존 설정 로드부터 삭제 흐름을 시작한다", async () => {
    const flowStarted = new Error("existing deletion flow started");
    mockedAuthorizeDeletion.mockResolvedValueOnce(true);
    mockedGetConfigOrThrow.mockRejectedValueOnce(flowStarted);

    await expect(parse(commandCase)).rejects.toBe(flowStarted);

    expect(mockedGetConfigOrThrow).toHaveBeenCalledOnce();
    expect(clientConstructor).not.toHaveBeenCalled();
  });
});
