import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";
const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/post/responses.json", import.meta.url), "utf8"));
const client = () => createWebClient("fake-session", "https://example.dooray.com", "https://api.dooray.com");
function mockServer(detail = structuredClone(fixtures.detail), workflows = structuredClone(fixtures.workflows)) {
  const writes: { path: string; body: any }[] = [];
  const mock = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") {
      writes.push({ path, body: await request.clone().json() });
      if (path.endsWith("/move")) detail.result.parent = { id: detail.result.id, number: detail.result.number, subject: detail.result.subject };
      return Response.json(path.endsWith("/move") ? fixtures.moved : path.endsWith("/posts") ? fixtures.created : fixtures.updated);
    }
    return Response.json(path.endsWith("/workflows") ? workflows : path.endsWith("/tasks") ? fixtures.list : detail);
  });
  vi.stubGlobal("fetch", mock);
  return { mock, writes };
}
afterEach(() => vi.unstubAllGlobals());
describe("웹 업무 요청과 공식 응답", () => {
  it("목록의 상태 필터 이름과 나머지 쿼리를 보존한다", async () => {
    const { mock } = mockServer();
    const response = await client().getPosts("project-1", { page: 1, size: 2, postWorkflowClasses: ["registered"], postWorkflowIds: ["workflow-1"], subjects: "예시", createdAt: "today", updatedAt: "today" });
    const url = new URL(mock.mock.calls[0][0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "1", size: "2", workflowClass: "registered", workflowIds: "workflow-1", subjects: "예시", createdAt: "today", updatedAt: "today" });
    expect(response.result[0]).toMatchObject({ project: { id: "project-1", code: "sample" }, taskNumber: "sample/42", milestone: { id: "milestone-1", name: "단계" }, tags: [{ id: "tag-1" }], fileIdList: ["file-1"] });
    expect(response.result[0]).not.toHaveProperty("secretInternal");
    expect(response.result[0]).not.toHaveProperty("body");
  });
  it("상세의 본문·참여자·파일을 공식 구조로 바꾸고 날짜를 유지한다", async () => {
    const { mock } = mockServer();
    const result = (await client().getPostStandalone("post-1")).result;
    expect(new URL(mock.mock.calls[0][0].url).searchParams.get("fields")).toBe("me,body");
    expect(result.body).toEqual({ mimeType: "text/x-markdown", content: "원래 본문" });
    expect(result.files).toEqual([{ id: "file-1", name: "sample.txt", size: 6 }]);
    expect(result.users.to[1].group).toEqual({ projectMemberGroupId: "group-1", members: [{ organizationMemberId: "member-1", name: "사용자" }] });
    expect(result.createdAt).toBe("2026-01-02T03:04:05+09:00");
    expect(result).toHaveProperty("startedAt", null);
  });
  it.each(["member", "group"])("%s 참여자의 상세→공식→수정 왕복에서 식별자가 같다", async (kind) => {
    const detail = structuredClone(fixtures.detail);
    detail.result.users.to = [structuredClone(fixtures.participants[kind])];
    if (kind === "group") detail.result.users.to[0].group.workflowId = "workflow-1";
    const { writes } = mockServer(detail), api = client();
    const post = (await api.getPost("project-1", "post-1")).result;
    await api.updatePost("project-1", "post-1", { subject: post.subject, body: post.body, users: { to: post.users.to, cc: [] } });
    expect(writes[0].body.users.to).toEqual(kind === "member" ? [{ type: "member", member: { organizationMemberId: "member-1", workflowId: "workflow-1" } }] : [{ type: "group", group: { projectMemberGroupId: "group-1", workflowId: "workflow-1" } }]);
  });
  it("emailUser 읽기는 보존하고 실측하지 않은 쓰기는 호출 전에 코드 3으로 막는다", async () => {
    const detail = structuredClone(fixtures.detail);
    detail.result.users.to = [fixtures.participants.emailUser];
    const { writes } = mockServer(detail), api = client();
    const post = (await api.getPost("project-1", "post-1")).result;
    expect(post.users.to[0]).toEqual(fixtures.participants.emailUser);
    await expect(api.updatePost("project-1", "post-1", { subject: post.subject, body: post.body, users: { to: post.users.to, cc: [] } })).rejects.toMatchObject({ exitCode: 3 });
    expect(writes).toEqual([]);
  });
  it("태그·단계·만기·우선순위·첨부의 누락과 undefined를 보존한다", async () => {
    const { writes } = mockServer();
    await client().updatePost("project-1", "post-1", { subject: "수정", body: { mimeType: "text/x-markdown", content: "수정" }, users: { to: [], cc: [] }, tagIds: undefined, milestoneId: undefined, dueDate: undefined });
    expect(writes[0].body).toMatchObject({ tagIdList: ["tag-1"], milestoneId: "milestone-1", fileIdList: ["file-1"], priority: "high", dueDate: "2026-02-01T09:00:00+09:00", dueDateFlag: true });
  });
  it("명시한 참여자의 기존 진행 상태를 요청에 보존한다", async () => {
    const { writes } = mockServer(), api = client();
    const input = { subject: "수정", body: { mimeType: "text/x-markdown", content: "수정" } };
    await api.updatePost("project-1", "post-1", { ...input, users: { to: [{ type: "member", member: { organizationMemberId: "member-1" } }], cc: [] } });
    for (const write of writes) expect(write.body.users.to[0].member).toEqual({ organizationMemberId: "member-1", workflowId: "workflow-1" });
  });
  it("담당자별 진행 상태가 다르면 일부만 쓰지 않고 코드 3으로 거절한다", async () => {
    const detail = structuredClone(fixtures.detail);
    detail.result.users.to.push({ type: "member", member: { organizationMemberId: "member-2", workflowId: "workflow-2" } });
    const { writes } = mockServer(detail);
    await expect(client().updatePost("project-1", "post-1", { subject: "수정", body: { mimeType: "text/x-markdown", content: "수정" }, users: { to: [], cc: [] } })).rejects.toMatchObject({ exitCode: 3 });
    expect(writes).toEqual([]);
  });
  it("명시한 빈 태그·참여자는 기존 값으로 덮지 않는다", async () => {
    const { writes } = mockServer();
    await client().updatePost("project-1", "post-1", { subject: "수정", body: { mimeType: "text/x-markdown", content: "수정" }, users: { to: [], cc: [] }, tagIds: [] });
    expect(writes[0].body).toMatchObject({ tagIdList: [], users: { to: [], cc: [] } });
  });
  it("서버가 무시하는 dueDateFlag:false는 쓰기 전 코드 3으로 거절한다", async () => {
    const { writes } = mockServer();
    await expect(client().updatePost("project-1", "post-1", { subject: "수정", body: { mimeType: "text/x-markdown", content: "수정" }, users: { to: [], cc: [] }, dueDateFlag: false })).rejects.toMatchObject({ exitCode: 3 });
    expect(writes).toEqual([]);
  });
  it("이미 일정 없음인 업무의 본문 수정은 일정 필드를 생략해 보존한다", async () => {
    const detail = structuredClone(fixtures.detail); detail.result.dueDateFlag = false; detail.result.dueDate = null;
    const { writes } = mockServer(detail);
    await client().updatePost("project-1", "post-1", { subject: "수정", body: { mimeType: "text/x-markdown", content: "수정" }, users: { to: [], cc: [] }, dueDateFlag: false });
    expect(writes[0].body).not.toHaveProperty("dueDateFlag");
    expect(writes[0].body).toHaveProperty("dueDate", null);
  });
  it("생성은 배열로 보내고 공개 ID만 반환한다", async () => {
    const { writes } = mockServer();
    expect((await client().createPost("project-1", { subject: "생성", body: { mimeType: "text/html", content: "<p>본문</p>" }, users: { to: [], cc: [] }, tagIds: ["tag-1"], parentPostId: "post-1" })).result).toEqual({ id: "created-1" });
    expect(writes[0].body).toEqual([{ subject: "생성", body: { mimeType: "text/html", content: "<p>본문</p>" }, users: { to: [], cc: [] }, tagIdList: ["tag-1"], fileIdList: [], parent: { number: 42 } }]);
  });
  it("업무 ID 대신 번호로 전체 상태와 상위를 변경한다", async () => {
    const { writes } = mockServer(), api = client();
    await api.setPostDone("project-1", "post-1");
    const moved = await api.setPostParent("project-1", "post-1", "post-1");
    expect(writes[0]).toEqual({ path: "/v2/wapi/projects/!project-1/posts/42/change-workflow", body: { workflowId: "closed-1" } });
    expect(writes[1]).toEqual({ path: "/v2/wapi/projects/!project-1/posts/42/move", body: { targetProjectId: "project-1", parentPostNumber: 42 } });
    expect(moved.result).toEqual({ post: { id: "post-1" }, project: { id: "project-1" } });
  });
  it("상위 변경 뒤 상세를 다시 읽고 다른 필드가 유지된 결과를 반환한다", async () => {
    const before = structuredClone(fixtures.detail), current = structuredClone(before);
    const parent = structuredClone(before); parent.result.id = "parent-1"; parent.result.number = 7;
    const writes: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (request.method === "POST") {
        writes.push(await request.clone().json());
        current.result.parent = { id: "parent-1", number: 7, subject: "상위" };
        return Response.json(fixtures.moved);
      }
      return Response.json(url.pathname.endsWith("/parent-1") ? parent : current);
    }));
    const api = client();
    await api.getPost("project-1", "post-1");
    const response = await api.setPostParent("project-1", "post-1", "parent-1");
    const after = (await api.getPost("project-1", "post-1")).result;
    expect(writes).toEqual([{ targetProjectId: "project-1", parentPostNumber: 7 }]);
    expect(response.result).toEqual({ post: { id: "post-1" }, project: { id: "project-1" } });
    expect(after.parent?.id).toBe("parent-1");
    for (const key of ["tagIdList", "milestoneId", "workflowId", "workflowClass", "users"]) expect(current.result[key]).toEqual(before.result[key]);
  });
  it("성공 헤더만 돌아와도 상세의 상위가 다르면 성공을 만들지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => Response.json(request.method === "POST" ? fixtures.moved : fixtures.detail)));
    await expect(client().setPostParent("project-1", "post-1", "post-1")).rejects.toMatchObject({ exitCode: 1 });
  });
  it("완료 상태가 여러 개면 대표를 추측하지 않고 쓰기 전에 거절한다", async () => {
    const workflows = structuredClone(fixtures.workflows);
    workflows.result.contents.push({ id: "closed-2", class: "closed", name: "취소", order: 5 });
    const { writes } = mockServer(undefined, workflows);
    await expect(client().setPostDone("project-1", "post-1")).rejects.toMatchObject({ exitCode: 3, message: expect.stringContaining("post workflow") });
    expect(writes).toEqual([]);
  });
  it("잘못된 필수 ID와 다른 프로젝트 대상은 쓰지 않는다", async () => {
    const detail = structuredClone(fixtures.detail); delete detail.result.id;
    mockServer(detail);
    await expect(client().getPostStandalone("post-1")).rejects.toMatchObject({ exitCode: 1 });
    const { writes } = mockServer();
    await expect(client().setPostParent("different-project", "post-1", "post-1")).rejects.toMatchObject({ exitCode: 3 });
    expect(writes).toEqual([]);
  });
});
