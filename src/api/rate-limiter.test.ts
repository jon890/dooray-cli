import { describe, expect, it } from "vitest";
import {
  createTokenBucket,
  parseRateLimitHeaders,
  DEFAULT_BURST_CAPACITY,
} from "./rate-limiter.js";

/** 실제 시간을 기다리지 않도록 sleep 이 가상 시계를 전진시킨다. */
function fakeClock() {
  let current = 0;
  const slept: number[] = [];
  return {
    now: () => current,
    sleep: async (ms: number) => {
      slept.push(ms);
      current += ms;
    },
    advance: (ms: number) => {
      current += ms;
    },
    slept,
  };
}

describe("createTokenBucket", () => {
  it("버스트 용량만큼은 기다리지 않고 통과시킨다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 20,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    for (let i = 0; i < 20; i += 1) {
      await bucket.acquire();
    }

    expect(clock.slept).toHaveLength(0);
  });

  it("용량을 소진하면 충전될 때까지 기다린다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 2,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();

    expect(clock.slept.length).toBeGreaterThan(0);
    // 초당 5개면 토큰 하나는 200ms
    expect(clock.slept[0]).toBeCloseTo(200, 0);
  });

  it("시간이 지나면 용량 상한까지만 충전된다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 3,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
    clock.advance(10_000);

    expect(bucket.available).toBe(3);
  });

  it("동시 호출이 남은 토큰을 초과해 통과하지 않는다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 3,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    await Promise.all([
      bucket.acquire(),
      bucket.acquire(),
      bucket.acquire(),
      bucket.acquire(),
    ]);

    // 앞의 셋은 즉시 통과하고 네 번째만 토큰 하나를 기다린다.
    // 초당 5개면 200ms 다.
    expect(clock.slept).toHaveLength(1);
    expect(clock.slept[0]).toBeCloseTo(200, 0);
  });

  it("available 은 상태를 바꾸지 않는다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 5,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    await bucket.acquire();
    clock.advance(200);

    // 여러 번 읽어도 같은 값이어야 한다
    expect(bucket.available).toBeCloseTo(5, 5);
    expect(bucket.available).toBeCloseTo(5, 5);
  });

  it("충전 속도가 0 이하로 들어오면 기본값으로 되돌린다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 1,
      replenishRate: 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    await bucket.acquire();
    await bucket.acquire();

    // 0 이었다면 무한 대기했을 것이다. 기본 충전 속도로 200ms 만 기다린다.
    expect(clock.slept).toHaveLength(1);
    expect(clock.slept[0]).toBeCloseTo(200, 0);
  });

  it("sync 는 서버가 알려준 잔량으로 내린다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 20,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    bucket.sync({ remaining: 3 });

    expect(bucket.available).toBe(3);
  });

  it("sync 는 로컬보다 낙관적인 잔량으로 올리지 않는다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 20,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    bucket.sync({ remaining: 2 });
    bucket.sync({ remaining: 19 });

    expect(bucket.available).toBe(2);
  });

  it("sync 는 용량과 충전 속도를 서버 값으로 갱신한다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 20,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    bucket.sync({ remaining: 0, burstCapacity: 40, replenishRate: 10 });
    clock.advance(1000);

    // 초당 10개 충전이 반영돼야 한다
    expect(bucket.available).toBeCloseTo(10, 0);
  });

  it("drain 은 남은 토큰을 비운다", async () => {
    const clock = fakeClock();
    const bucket = createTokenBucket({
      capacity: 20,
      replenishRate: 5,
      now: clock.now,
      sleep: clock.sleep,
    });

    bucket.drain();

    expect(bucket.available).toBe(0);
  });

  it("옵션이 없으면 실측한 Dooray 기본값을 쓴다", () => {
    const bucket = createTokenBucket();

    expect(bucket.available).toBe(DEFAULT_BURST_CAPACITY);
  });
});

describe("parseRateLimitHeaders", () => {
  it("Dooray 응답 헤더를 읽는다", () => {
    const headers = new Headers({
      "x-ratelimit-remaining": "19",
      "x-ratelimit-burst-capacity": "20",
      "x-ratelimit-replenish-rate": "5",
    });

    expect(parseRateLimitHeaders(headers)).toEqual({
      remaining: 19,
      burstCapacity: 20,
      replenishRate: 5,
    });
  });

  it("헤더가 없으면 undefined 로 둔다", () => {
    expect(parseRateLimitHeaders(new Headers())).toEqual({
      remaining: undefined,
      burstCapacity: undefined,
      replenishRate: undefined,
    });
  });

  it("숫자가 아니거나 음수인 값은 무시한다", () => {
    const headers = new Headers({
      "x-ratelimit-remaining": "unknown",
      "x-ratelimit-burst-capacity": "-1",
    });

    const snapshot = parseRateLimitHeaders(headers);

    expect(snapshot.remaining).toBeUndefined();
    expect(snapshot.burstCapacity).toBeUndefined();
  });
});
