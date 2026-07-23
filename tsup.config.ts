import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const packageJson: unknown = JSON.parse(readFileSync("package.json", "utf8"));

if (
  packageJson == null ||
  typeof packageJson !== "object" ||
  !("version" in packageJson) ||
  typeof packageJson.version !== "string"
) {
  throw new Error("package.json version must be a string");
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node18",
  clean: true,
  noExternal: [],
  external: ["imapflow", "mailparser", "nodemailer"],
  define: {
    __DOORAY_CLI_VERSION__: JSON.stringify(packageJson.version),
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
