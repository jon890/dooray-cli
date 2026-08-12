/**
 * Dooray API 의 요청 토큰 풀.
 *
 * Dooray 는 고정 초당 횟수가 아니라 토큰 버킷으로 제한하며, 매 응답에 현재 상태를 알려준다.
 *
 * ```
 * x-ratelimit-burst-capacity: 20   버킷 크기
 * x-ratelimit-replenish-rate: 5    초당 충전량
 * x-ratelimit-remaining: 19        지금 남은 토큰
 * ```
 *
 * 그래서 클라이언트도 같은 모양의 버킷을 두고 응답 헤더로 보정한다.
 * 고정 간격으로 묶으면 버스트 여유를 못 쓰고, 제한을 무시하면 429 가 난다.
 */

export interface RateLimitSnapshot {
  remaining?: number;
  burstCapacity?: number;
  replenishRate?: number;
}

export interface TokenBucketOptions {
  capacity?: number;
  replenishRate?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface TokenBucket {
  /** 토큰 하나를 확보한다. 없으면 충전될 때까지 기다린다. */
  acquire(): Promise<void>;
  /** 응답 헤더로 읽은 서버 상태를 반영한다. */
  sync(snapshot: RateLimitSnapshot): void;
  /** 429 를 받았을 때 남은 토큰을 비운다. */
  drain(): void;
  /** 진단·테스트용 현재 토큰 수. */
  readonly available: number;
}

/** 실측한 Dooray 기본값. 첫 응답 헤더가 오면 그 값으로 대체된다. */
export const DEFAULT_BURST_CAPACITY = 20;
export const DEFAULT_REPLENISH_RATE = 5;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRateLimitHeaders(headers: Headers): RateLimitSnapshot {
  const read = (name: string): number | undefined => {
    const raw = headers.get(name);
    if (raw == null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };

  return {
    remaining: read("x-ratelimit-remaining"),
    burstCapacity: read("x-ratelimit-burst-capacity"),
    replenishRate: read("x-ratelimit-replenish-rate"),
  };
}

export function createTokenBucket(options: TokenBucketOptions = {}): TokenBucket {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;

  let capacity = options.capacity ?? DEFAULT_BURST_CAPACITY;
  let replenishRate = options.replenishRate ?? DEFAULT_REPLENISH_RATE;
  let tokens = capacity;
  let updatedAt = now();

  // 동시 호출이 같은 잔량을 보고 함께 통과하는 것을 막는다.
  let queue: Promise<void> = Promise.resolve();

  function refill(): void {
    const at = now();
    const elapsed = at - updatedAt;
    if (elapsed <= 0) return;
    tokens = Math.min(capacity, tokens + (elapsed / 1000) * replenishRate);
    updatedAt = at;
  }

  async function take(): Promise<void> {
    for (;;) {
      refill();
      if (tokens >= 1) {
        tokens -= 1;
        return;
      }
      // 토큰 하나가 찰 때까지의 시간. 최소 대기를 둬 바쁜 대기를 막는다.
      const waitMs = Math.max(((1 - tokens) / replenishRate) * 1000, 10);
      await sleep(waitMs);
    }
  }

  return {
    acquire(): Promise<void> {
      const next = queue.then(take);
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },

    sync(snapshot: RateLimitSnapshot): void {
      if (snapshot.burstCapacity != null && snapshot.burstCapacity > 0) {
        capacity = snapshot.burstCapacity;
      }
      if (snapshot.replenishRate != null && snapshot.replenishRate > 0) {
        replenishRate = snapshot.replenishRate;
      }
      if (snapshot.remaining != null) {
        // 서버가 권위다. 로컬이 더 낙관적이면 서버 값으로 내린다.
        refill();
        tokens = Math.min(tokens, Math.min(snapshot.remaining, capacity));
        updatedAt = now();
      }
    },

    drain(): void {
      tokens = 0;
      updatedAt = now();
    },

    get available(): number {
      refill();
      return tokens;
    },
  };
}
