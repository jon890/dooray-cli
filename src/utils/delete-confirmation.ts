import { DoorayCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

export type ConfirmDeletion = () => Promise<boolean>;

export async function authorizeDeletion(
  skipConfirmation: boolean,
  isTTY: boolean,
  confirmDeletion: ConfirmDeletion,
): Promise<boolean> {
  if (skipConfirmation) {
    return true;
  }

  if (!isTTY) {
    throw new DoorayCliError(
      "non-TTY 환경에서는 삭제 확인을 진행할 수 없습니다. --yes(-y) 플래그로 다시 실행하세요.",
      EXIT_PARAM_ERROR,
    );
  }

  return confirmDeletion();
}

export async function promptDeletion(message: string): Promise<boolean> {
  const { confirm } = await import("@inquirer/prompts");
  return confirm({ message, default: false });
}
