export interface ThreadSendOptions {
  log?: string;
  body?: string;
  bodyFile?: string;
  threadBody?: string;
  threadBodyFile?: string;
}

export interface ThreadOptionsCheck {
  warnings: string[];
  error?: string;
}

/**
 * `thread-send` 옵션 조합을 판정한다 (ADR-052).
 *
 * 던지지 않고 결과를 돌려준다. 호출부가 경고를 stderr 로, 에러를 `DoorayCliError` 로 옮긴다.
 */
export function checkThreadOptions(opts: ThreadSendOptions): ThreadOptionsCheck {
  const warnings: string[] = [];

  // logs/{log-id}/threads/create-and-send 는 text 만 받는다. threadText 는 전달할 곳이 없다.
  if (opts.log && (opts.threadBody != null || opts.threadBodyFile != null)) {
    warnings.push(
      "--log 와 함께 --thread-body/--thread-body-file 을 지정해도 무시됩니다. logs 스레드는 --body 만 사용합니다.",
    );
  }

  // readBodyInputOrNull({ body, bodyFile }) 은 이 이름으로만 동시 지정을 검사하므로,
  // threadBody/threadBodyFile 이름으로 넘기는 이 옵션 쌍은 스스로 잡지 못한다.
  if (opts.threadBody != null && opts.threadBodyFile != null) {
    return {
      warnings,
      error: "--thread-body와 --thread-body-file은 함께 사용할 수 없습니다.",
    };
  }

  // stdin은 한 번만 읽을 수 있어 --body와 --thread-body 계열이 동시에 "-" 를 가리킬 수 없다.
  const bodyIsStdin = opts.body === "-" || opts.bodyFile === "-";
  const threadBodyIsStdin = opts.threadBody === "-" || opts.threadBodyFile === "-";
  if (bodyIsStdin && threadBodyIsStdin) {
    return {
      warnings,
      error: "--body와 --thread-body는 동시에 stdin(-)을 지정할 수 없습니다.",
    };
  }

  return { warnings };
}
