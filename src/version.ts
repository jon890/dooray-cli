declare const __DOORAY_CLI_VERSION__: string | undefined;

export const CLI_VERSION =
  typeof __DOORAY_CLI_VERSION__ === "string"
    ? __DOORAY_CLI_VERSION__
    : "0.0.0-dev";
