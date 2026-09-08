import { describe, expect, it } from "vitest";
import { parseJsonPreservingLargeIntegers } from "./json-large-integer.js";

describe('parseJsonPreservingLargeIntegers', () => {
  it('19자리 정수를 문자열로 보존한다', () => {
    const result = parseJsonPreservingLargeIntegers('{"id": 1234567890123456789}') as {
      id: unknown;
    };
    expect(result.id).toBe('1234567890123456789');
  });

  it('안전 범위 정수는 숫자로 유지한다', () => {
    const result = parseJsonPreservingLargeIntegers('{"seq": 259}') as { seq: unknown };
    expect(result.seq).toBe(259);
  });

  it('타임스탬프는 숫자로 유지한다', () => {
    const result = parseJsonPreservingLargeIntegers('{"sentAt": 1788834599820}') as {
      sentAt: unknown;
    };
    expect(result.sentAt).toBe(1788834599820);
  });

  it('MAX_SAFE_INTEGER 경계값은 숫자로 유지한다', () => {
    const result = parseJsonPreservingLargeIntegers('{"n": 9007199254740991}') as { n: unknown };
    expect(result.n).toBe(9007199254740991);
  });

  it('경계 바로 위 값은 문자열로 보존한다', () => {
    const result = parseJsonPreservingLargeIntegers('{"n": 9007199254740993}') as { n: unknown };
    expect(result.n).toBe('9007199254740993');
  });

  it('음수 큰 정수를 문자열로 보존한다', () => {
    const result = parseJsonPreservingLargeIntegers('{"n": -1234567890123456789}') as {
      n: unknown;
    };
    expect(result.n).toBe('-1234567890123456789');
  });

  it('실수와 지수 표기는 그대로 둔다', () => {
    const result = parseJsonPreservingLargeIntegers('{"n": 1.5, "e": 1e21}') as {
      n: unknown;
      e: unknown;
    };
    expect(result.n).toBe(1.5);
    expect(result.e).toBe(1e21);
  });

  it('문자열 안의 숫자는 건드리지 않는다', () => {
    const result = parseJsonPreservingLargeIntegers('{"text": "1234567890123456789"}') as {
      text: unknown;
    };
    expect(result.text).toBe('1234567890123456789');
  });

  it('이스케이프된 따옴표를 건너뛰고 그 뒤 필드는 정상 판정한다', () => {
    const input =
      '{"text": "그는 \\"1234567890123456789\\" 라 했다", "id": 1234567890123456789}';
    const result = parseJsonPreservingLargeIntegers(input) as { text: unknown; id: unknown };
    expect(result.text).toBe('그는 "1234567890123456789" 라 했다');
    expect(result.id).toBe('1234567890123456789');
  });

  it('direct-send 실측 응답 모양에서 손실 나는 필드만 문자열로 바꾼다', () => {
    const input =
      '{"header":{"resultCode":0,"resultMessage":"","isSuccessful":true},' +
      '"result":{"id":1234567890123456789,"channelId":2222333344445555666,' +
      '"directMemberId":0,"type":0,"senderId":3333444455556666777,' +
      '"sentAt":1788834599820,"seq":259,"text":"메시지","unreadCount":0,' +
      '"mentionCount":0,"flags":0}}';

    const result = parseJsonPreservingLargeIntegers(input) as {
      result: {
        id: unknown;
        channelId: unknown;
        directMemberId: unknown;
        type: unknown;
        senderId: unknown;
        sentAt: unknown;
        seq: unknown;
        text: unknown;
        unreadCount: unknown;
        mentionCount: unknown;
        flags: unknown;
      };
    };

    expect(result.result.id).toBe('1234567890123456789');
    expect(result.result.channelId).toBe('2222333344445555666');
    expect(result.result.senderId).toBe('3333444455556666777');

    expect(result.result.directMemberId).toBe(0);
    expect(result.result.type).toBe(0);
    expect(result.result.sentAt).toBe(1788834599820);
    expect(result.result.seq).toBe(259);
    expect(result.result.unreadCount).toBe(0);
    expect(result.result.mentionCount).toBe(0);
    expect(result.result.flags).toBe(0);
    expect(result.result.text).toBe('메시지');
  });

  it('배열 안의 값도 각각 판정한다', () => {
    const result = parseJsonPreservingLargeIntegers('{"ids": [1234567890123456789, 1]}') as {
      ids: unknown[];
    };
    expect(result.ids[0]).toBe('1234567890123456789');
    expect(result.ids[1]).toBe(1);
  });

  it('잘못된 JSON 은 오류를 던진다', () => {
    expect(() => parseJsonPreservingLargeIntegers('{invalid')).toThrow();
  });

  // 감싸기는 잘못된 리터럴을 유효한 문자열로 바꿔 오류를 없앨 수 있다.
  // JSON 숫자 문법을 통과한 정수만 감싸서, 깨진 응답이 그대로 오류로 드러나게 한다.
  it('숫자가 없는 부호는 감싸지 않고 오류로 남긴다', () => {
    expect(() => parseJsonPreservingLargeIntegers('{"a": -}')).toThrow();
  });

  it('선행 0 이 붙은 리터럴은 감싸지 않고 오류로 남긴다', () => {
    expect(() => parseJsonPreservingLargeIntegers('{"a": 007}')).toThrow();
  });

  it('0 과 -0 은 유효한 정수라 그대로 숫자로 남는다', () => {
    const result = parseJsonPreservingLargeIntegers('{"a": 0, "b": -0}') as {
      a: unknown;
      b: unknown;
    };
    expect(result.a).toBe(0);
    expect(result.b).toBe(-0);
  });
});
