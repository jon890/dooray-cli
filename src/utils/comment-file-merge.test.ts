import { describe, expect, it } from "vitest";
import { mergeCommentFiles } from "./comment-file-merge.js";

const postFile = {
  id: "file-1",
  name: "report.pdf",
  size: 1024,
  mimeType: "application/pdf",
};

describe("mergeCommentFiles", () => {
  it("댓글 첨부의 이름과 크기를 업무 첨부에서 보강", () => {
    expect(mergeCommentFiles({
      commentFiles: [{ id: "file-1", name: null, size: null }],
      bodyRefs: [],
      postFiles: [postFile],
    })).toEqual([{ ...postFile, source: "attachment" }]);
  });

  it("본문 참조만 있으면 body-link 출처로 반환", () => {
    expect(mergeCommentFiles({
      commentFiles: [],
      bodyRefs: [{ id: "file-1", label: "사용자 라벨" }],
      postFiles: [postFile],
    })).toEqual([{ ...postFile, source: "body-link" }]);
  });

  it("양쪽에 같은 id가 있으면 한 건으로 합침", () => {
    expect(mergeCommentFiles({
      commentFiles: [{ id: "file-1", name: null, size: null }],
      bodyRefs: [{ id: "file-1", label: "사용자 라벨" }],
      postFiles: [postFile],
    })).toEqual([{ ...postFile, source: "both" }]);
  });

  it("업무 첨부에 없는 id는 라벨 외 메타데이터를 null로 유지", () => {
    expect(mergeCommentFiles({
      commentFiles: [{ id: "attachment-only", name: null, size: null }],
      bodyRefs: [{ id: "body-only", label: "본문 파일" }],
      postFiles: [],
    })).toEqual([
      { id: "attachment-only", name: null, size: null, mimeType: null, source: "attachment" },
      { id: "body-only", name: "본문 파일", size: null, mimeType: null, source: "body-link" },
    ]);
  });

  it("업무 첨부 목록이 비어도 정상 병합", () => {
    expect(mergeCommentFiles({
      commentFiles: [{ id: "file-1", name: "서버 이름", size: null }],
      bodyRefs: [],
      postFiles: [],
    })).toEqual([
      { id: "file-1", name: "서버 이름", size: null, mimeType: null, source: "attachment" },
    ]);
  });

  it("본문에 같은 id가 반복돼도 첫 등장 한 건만 유지", () => {
    expect(mergeCommentFiles({
      commentFiles: [],
      bodyRefs: [
        { id: "file-1", label: "첫 번째" },
        { id: "file-1", label: "두 번째" },
      ],
      postFiles: [],
    })).toEqual([
      { id: "file-1", name: "첫 번째", size: null, mimeType: null, source: "body-link" },
    ]);
  });
});
