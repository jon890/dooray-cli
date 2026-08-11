import { describe, expect, it } from "vitest";
import { calculateStats } from "./stats.mjs";

function entry(id, assigneeKind, text, label = "human") {
  return { id, assigneeKind, text, label };
}

describe("calculateStats", () => {
  it("human 표본을 assigneeKind별로 나눠 집계한다", () => {
    const result = calculateStats([
      entry("<postId>#body", "member", "안녕하세요!\n확인했습니다."),
      entry("<postId>#log-<logId>", "group", "원인 파악 -> 수정 완료"),
      entry("<otherPostId>#body", "none", "후속 작업 필요"),
      entry("<otherPostId>#log-<logId>", "group", "제외", "ai-suspect"),
    ]);

    expect(result.totalEntries).toBe(3);
    expect(result.byAssigneeKind.member.entries).toBe(1);
    expect(result.byAssigneeKind.group.entries).toBe(1);
    expect(result.byAssigneeKind.none.entries).toBe(1);
    expect(result.byAssigneeKind.group.symbols["->"]).toBe(1);
    expect(result.byAssigneeKind.member.greetingOrMentionStarts).toEqual({
      count: 1,
      ratio: 1,
    });
  });

  it("종결 형태와 문장 길이 사분위를 계산한다", () => {
    const result = calculateStats([
      entry("<postId>#body", "member", "확인 완료\n원인을 파악했습니다."),
    ]).byAssigneeKind.member;

    expect(result.endings).toMatchObject({ nounPhrase: 1, verb: 1, total: 2 });
    expect(result.sentenceLength.count).toBe(2);
    expect(result.sentenceLength.q1).toBeLessThanOrEqual(
      result.sentenceLength.median,
    );
    expect(result.sentenceLength.median).toBeLessThanOrEqual(
      result.sentenceLength.q3,
    );
  });
});
