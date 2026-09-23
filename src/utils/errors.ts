export class DoorayCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DoorayCliError";
  }
}
