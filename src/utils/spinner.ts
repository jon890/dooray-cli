import ora, { type Ora } from "ora";

let current: Ora | null = null;
let quiet = false;

const noopSpinner: Ora = new Proxy({} as Ora, {
  get(_target, prop) {
    if (prop === "text" || prop === "prefixText" || prop === "suffixText") return "";
    if (prop === "isSpinning") return false;
    // 모든 메서드는 self-chainable no-op
    return () => noopSpinner;
  },
  set() {
    // text / prefixText / suffixText 등 setter 는 silent ignore
    return true;
  },
});

export function setQuiet(value: boolean): void {
  quiet = value;
}

export function startSpinner(text: string): Ora {
  if (quiet) return noopSpinner;
  current = ora({ text, stream: process.stderr }).start();
  return current;
}

export function stopSpinner(success?: boolean, text?: string): void {
  if (!current) return; // quiet 모드에서는 current 가 절대 set 안 되므로 no-op
  if (success === false) current.fail(text);
  else current.succeed(text);
  current = null;
}
