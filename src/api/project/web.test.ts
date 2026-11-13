import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "../web/index.js";
const fixtures = JSON.parse(readFileSync(new URL("../web/fixtures/project/responses.json", import.meta.url), "utf8"));
const client = () => createWebClient("fake-session", "https://my-org.dooray.com");
function respond(key: string) {
  const bodies: unknown[] = [];
  const mock = vi.fn(async (request: Request) => {
    if (request.body) bodies.push(await request.clone().json());
    return Response.json(fixtures[key]);
  });
  vi.stubGlobal("fetch", mock); return Object.assign(mock, { bodies });
}
afterEach(() => vi.unstubAllGlobals());
describe("웹 프로젝트 공식 응답 변환", () => {
  it("프로젝트 참조 객체와 쿼리를 변환하고 내부 필드를 제외한다", async () => {
    const mock = respond("projects");
    const response = await client().getProjects({ page: 1, size: 1, type: "private", scope: "public", state: "active" });
    const url = new URL(mock.mock.calls[0][0].url);
    expect(url.pathname).toBe("/wapi/project/v1/projects");
    expect(Object.fromEntries(url.searchParams)).toEqual({ member: "me", page: "1", size: "1", type: "private", scope: "public", state: "active" });
    expect(response.result[0]).toMatchObject({ organization: { id: "org-1" }, drive: { id: "drive-1" }, wiki: { id: "wiki-1" } });
    expect(response.result[0]).not.toHaveProperty("hiddenFlag");
    expect(response.totalCount).toBe(2);
  });
  it("워크플로의 다국어 이름·순서를 보존하고 projectId 를 뺀다", async () => {
    respond("workflows");
    expect((await client().getProjectWorkflows("project-1")).result).toEqual([{ id: "workflow-1", name: "등록", class: "registered", order: 1, names: [{ locale: "ko_KR", name: "등록" }] }]);
  });
  it("태그 그룹 참조와 그룹 없는 태그를 구분한다", async () => {
    const mock = respond("tags");
    const result = await client().getProjectTags("project/id", { page: 1, size: 2 });
    expect(mock.mock.calls[0][0].url).toContain("/!project%2Fid/tags?page=1&size=2");
    expect(result.result[0].tagGroup).toEqual({ id: "group-1", name: "단계", mandatory: false, selectOne: true });
    expect(result.result[1].tagGroup).toBeNull();
  });
  it("태그 생성은 배열로 보내고 생성 ID 를 단건으로 돌려준다", async () => {
    const mock = respond("created");
    const body = { name: "임시:태그", color: "e0e0e0" };
    expect((await client().createProjectTag("project-1", body)).result).toEqual({ id: "tag-3" });
    expect(mock.bodies[0]).toEqual([body]);
    expect(mock.mock.calls[0][0].method).toBe("POST");
  });
  it("태그 그룹 PUT 은 tag-prefixes 로 보내며 다른 값을 더하지 않는다", async () => {
    const mock = respond("updated"); const body = { mandatory: false, selectOne: true };
    expect((await client().updateProjectTagGroup("project-1", "group-1", body)).result).toBeNull();
    expect(mock.mock.calls[0][0].url).toContain("/tag-prefixes/group-1");
    expect(mock.bodies[0]).toEqual(body);
    expect(mock.mock.calls[0][0].method).toBe("PUT");
  });
  it("마일스톤 날짜를 오프셋 표기로 유지하고 내부 필드를 뺀다", async () => {
    respond("milestones");
    expect((await client().getProjectMilestones("project-1")).result).toEqual([{ id: "milestone-1", name: "출시", status: "open", startedAt: "2026-11-14+09:00", endedAt: "2026-12-01+09:00", closedAt: null, createdAt: "2026-11-14T10:00:00+09:00", updatedAt: "2026-11-14T01:00:00+00:00" }]);
  });
  it("프로젝트 목록의 참조를 멤버 그룹에 재사용한다", async () => {
    const mock = vi.fn(async (request: Request) => Response.json(new URL(request.url).pathname.endsWith("/projects") ? fixtures.projects : fixtures.groups));
    vi.stubGlobal("fetch", mock); const c = client(); await c.getProjects();
    const result = await c.getProjectMemberGroups("project-1");
    expect(result.result).toEqual([{ id: "group-1", code: "reviewers", project: { id: "project-1", code: "my-project" }, createdAt: "2026-11-14T01:00:00+00:00", updatedAt: "2026-11-14T10:00:00+09:00" }]);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("프로젝트 ID 직접 입력이면 한 번만 project.code 를 보강한다", async () => {
    const mock = vi.fn(async (request: Request) => Response.json(new URL(request.url).pathname.endsWith("/project-member-groups") ? fixtures.groups : fixtures.projectDetail));
    vi.stubGlobal("fetch", mock); const c = client();
    await c.getProjectMemberGroups("project-1"); await c.getProjectMemberGroups("project-1");
    expect(mock.mock.calls.filter(([request]) => new URL(request.url).pathname.endsWith("!project-1"))).toHaveLength(1);
  });
  it("템플릿 목록은 참조를 보강하고 상세 전용 본문은 제외한다", async () => {
    respond("templates");
    const response = await client().getProjectTemplates("project-1");
    expect(response.result[0]).toMatchObject({ project: { id: "project-1", code: "my-project" }, milestone: { id: "milestone-1", name: "출시" }, tags: [{ id: "tag-1" }], users: { to: [{ type: "member", member: { organizationMemberId: "member-1" } }], cc: [] } });
    expect(response.result[0]).not.toHaveProperty("body");
    expect(response.result[0]).not.toHaveProperty("version");
  });
  it("템플릿 상세는 interpolation 과 본문 형식을 변환한다", async () => {
    const fixture = { header: fixtures.templates.header, result: { content: fixtures.templates.result.contents[0], references: fixtures.templates.result.references } };
    const mock = vi.fn(async (_request: Request) => Response.json(fixture)); vi.stubGlobal("fetch", mock);
    const response = await client().getProjectTemplateDetail("project-1", "template-1", false);
    expect(new URL(mock.mock.calls[0][0].url).searchParams.get("interpolation")).toBe("false");
    expect(response.result.body).toEqual({ mimeType: "text/x-markdown", content: "본문" });
    expect(response.result).toHaveProperty("guide", { mimeType: "text/plain", content: "안내" });
  });
  it("템플릿 그룹 참조자의 memberList 를 공식 members 로 변환한다", async () => {
    const fixture = structuredClone(fixtures.templates);
    fixture.result.contents[0].users.cc = [{ type: "group", group: { projectMemberGroupId: "group-1", memberList: [{ organizationMemberId: "member-1", name: "홍길동", tenantId: "internal" }] } }];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(fixture)));
    const result = (await client().getProjectTemplates("project-1")).result[0];
    expect(result).toMatchObject({ users: { cc: [{ type: "group", group: { projectMemberGroupId: "group-1", members: [{ organizationMemberId: "member-1", name: "홍길동" }] } }] } });
  });
  it.each([{}, { contents: [{}], totalCount: 1 }, { contents: [], totalCount: undefined }])("필수 구조가 없으면 오류로 끝낸다", async (result) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ header: fixtures.tags.header, result })));
    await expect(client().getProjectTags("project-1")).rejects.toMatchObject({ exitCode: 1 });
  });
});
