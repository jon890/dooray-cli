import { describe, expect, it } from "vitest";
import {
  buildSubjectShapeIndex,
  extractSignals,
  labelEntry,
} from "./signals.mjs";

describe("labelEntry", () => {
  it("헤더와 표가 많은 배포 기록을 formal-template으로 먼저 분류한다", () => {
    const entry = {
      id: "<postId>#body",
      subject: "8월 정기 배포 기록",
      text: [
        "# 변경 사항",
        "## 상세",
        "| 항목 | 내용 |",
        "| --- | --- |",
        "**기능**을 **개선**했습니다.",
        "## 정리",
      ].join("\n"),
    };
    const decision = labelEntry(entry, extractSignals(entry.text), [entry]);

    expect(decision.label).toBe("formal-template");
  });

  it("AI 구조 신호가 높고 정형 가능성이 섞이면 검토 대상으로 둔다", () => {
    const entry = {
      id: "<postId>#body",
      postId: "<postId>",
      subject: "작업 결과 2",
      text: [
        "# 변경 사항",
        "## 영향",
        "| 항목 | 내용 |",
        "| --- | --- |",
        "**첫째**, **둘째** 항목을 확인했습니다.",
        "## 다음 단계",
      ].join("\n"),
    };
    const context = [
      { postId: "<otherPostId>", subject: "작업 결과 1" },
      entry,
    ];
    const decision = labelEntry(entry, extractSignals(entry.text), context);

    expect(decision.label).toBe("ai-suspect");
    expect(decision.needsReview).toBe(true);
  });

  it("한 업무의 본문과 댓글은 반복 제목 여러 건으로 세지 않는다", () => {
    const entry = {
      id: "<postId>#body",
      postId: "<postId>",
      subject: "정기 확인 1",
      text: "짧은 확인 내용",
    };
    const context = [
      entry,
      { id: "<postId>#log-<logId>", postId: "<postId>", subject: "정기 확인 1" },
      { id: "<postId>#log-<otherLogId>", postId: "<postId>", subject: "정기 확인 1" },
    ];

    expect(labelEntry(entry, extractSignals(entry.text), context).label).toBe(
      "human",
    );
  });

  it("사전 계산한 제목 색인을 넘겨도 배열을 넘긴 것과 같은 결과를 낸다", () => {
    const entry = {
      id: "<postId>#body",
      postId: "<postId>",
      subject: "정기 확인 1",
      text: "짧은 확인 내용",
    };
    const context = [
      entry,
      { id: "<otherPostId>#body", postId: "<otherPostId>", subject: "정기 확인 2" },
      { id: "<thirdPostId>#body", postId: "<thirdPostId>", subject: "정기 확인 3" },
    ];
    const signals = extractSignals(entry.text);

    expect(labelEntry(entry, signals, buildSubjectShapeIndex(context))).toEqual(
      labelEntry(entry, signals, context),
    );
    expect(
      labelEntry(entry, signals, buildSubjectShapeIndex(context)).label,
    ).toBe("formal-template");
  });

  it("짧은 항목 나열 글은 human으로 남긴다", () => {
    const entry = {
      id: "<postId>#log-<logId>",
      subject: "확인 사항",
      text: "- 로그 확인\n- 재현 완료\n- 원인 파악 중",
    };

    expect(labelEntry(entry, extractSignals(entry.text), [entry])).toEqual({
      label: "human",
      needsReview: false,
      reasons: [],
    });
  });

  it.each(["릴리스 v1.2", "변경 내역", "정기 점검"])(
    "%s 성격의 제목을 formal-template으로 분류한다",
    (subject) => {
      const entry = {
        id: "<postId>#body",
        postId: "<postId>",
        subject,
        text: "정형 작업 기록",
      };

      expect(labelEntry(entry, extractSignals(entry.text), [entry]).label).toBe(
        "formal-template",
      );
    },
  );
});

describe("extractSignals", () => {
  it("구조 신호와 글자 수를 개수로 반환한다", () => {
    const text = "# 요약\n| A | B |\n**중요**\n- 항목\n🙂";

    expect(extractSignals(text)).toMatchObject({
      headings: 1,
      tableRows: 1,
      boldRuns: 1,
      bullets: 1,
      emoji: 1,
      closingSections: 1,
      chars: text.length,
    });
  });
});
