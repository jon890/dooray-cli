/** 업무·댓글·첨부의 웹 요청을 공식 응답으로 바꾼다. 원본 상세는 쓰기 시 필드 보존에만 쓴다. */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { PostClient } from "./types.js";
import type { Post, PostDetail, PostUser, CreatePostUser, PostComment, PostFileDetail, CreatePostRequest, UpdatePostRequest } from "../types.js";
import type { WebContext } from "../web/context.js";
import type { WebEnvelope } from "../web/http.js";
import { apiPath } from "../api-path.js";
import { count, date, identifier, invalidResponse, pick, referenceMap, row, rows, text, type Row } from "../web/convert.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { parseContentDispositionFileName, fallbackFileName } from "../../utils/content-disposition.js";

function unsupported(): never {
  throw new DoorayCliError("웹 방식에서는 이 참여자 종류를 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return invalidResponse();
  return value.map(identifier);
}
function body(value: unknown) { const b = row(value); return { mimeType: text(b.mimeType), content: text(b.content) }; }
function workflow(value: unknown) { const w = row(value); return { id: identifier(w.id), name: text(w.name) }; }

function user(value: unknown, refs: unknown): PostUser {
  const u = row(value), type = text(u.type);
  let result: PostUser;
  if (type === "member") {
    const m = row(u.member);
    result = { type, member: { organizationMemberId: identifier(m.organizationMemberId ?? m.id), ...pick(m, ["name"]) } };
  } else if (type.toLowerCase() === "emailuser") {
    const e = row(u.emailUser ?? u.emailuser);
    result = { type: "emailUser", emailUser: { emailAddress: text(e.emailAddress), name: text(e.name) } };
  } else if (type === "group") {
    const g = row(u.group);
    result = { type, group: {
      projectMemberGroupId: identifier(g.projectMemberGroupId ?? g.id),
      members: rows(g.memberList ?? g.members ?? []).map((m) => ({ organizationMemberId: identifier(m.organizationMemberId ?? m.id), ...pick(m, ["name"]) })),
    } };
  } else return unsupported();
  const nested = type === "member" ? row(u.member) : type === "group" ? row(u.group) : {};
  if (nested.workflowId != null) {
    const w = referenceMap(refs, "workflowMap")[identifier(nested.workflowId)];
    if (w !== undefined) result.workflow = workflow(w);
  }
  return result;
}

/** 지원하지 않는 종류는 수정 전에 거절한다. 읽은 참여자를 일부만 보내지 않는다. */
function requestUser(value: CreatePostUser, previous: Row[] = []): Row {
  const u = row(value);
  if (u.type !== "member" && u.type !== "group") return unsupported();
  const type = u.type, source = row(u[type]);
  const key = type === "member" ? "organizationMemberId" : "projectMemberGroupId";
  const id = identifier(source[key] ?? source.id);
  const existing = previous.find((p) => p.type === type && (row(p[type])[key] ?? row(p[type]).id) === id);
  const workflowId = existing ? row(existing[type]).workflowId : undefined;
  return { type, [type]: { [key]: id, ...(workflowId != null && { workflowId: identifier(workflowId) }) } };
}
function requestUsers(value: unknown, previous?: unknown) {
  const u = row(value), prior = row(previous ?? {});
  const convert = (role: "to" | "cc") => rows(u[role]).map((v) => requestUser(v as unknown as CreatePostUser, rows(prior[role] ?? [])));
  return { to: convert("to"), cc: convert("cc") };
}
function fileDate(value: unknown): string | null {
  return date(typeof value === "string" ? value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") : value);
}
function file(source: Row): PostFileDetail {
  const creator = user(source.creator, {});
  if (creator.type === "group") return invalidResponse();
  return { id: identifier(source.id), name: text(source.name), size: count(source.size), mimeType: text(source.mimeType), createdAt: fileDate(source.createdAt) ?? invalidResponse(), creator };
}
function fileRefs(source: Row, refs: unknown) {
  const files = referenceMap(refs, "fileMap");
  return ids(source.fileIdList ?? []).map((id) => {
    const f = row(files[id]);
    return { id, name: text(f.name), size: count(f.size) };
  });
}
function comment(source: Row, refs: unknown, detail: boolean): PostComment {
  const result: PostComment = {
    id: identifier(source.id), post: { id: identifier(source.postId) }, type: text(source.type), subtype: text(source.subtype),
    createdAt: date(source.createdAt) ?? invalidResponse(), creator: user(source.creator, refs), body: body(source.body),
  };
  if (source.modifiedAt !== undefined) Object.assign(result, { modifiedAt: date(source.modifiedAt) });
  if (source.mailUsers != null) {
    const mail = row(source.mailUsers);
    const email = (v: Row) => ({ name: text(v.name), emailAddress: text(v.emailAddress) });
    result.mailUsers = { ...(mail.from != null && { from: email(row(mail.from)) }), to: rows(mail.to ?? []).map(email), cc: rows(mail.cc ?? []).map(email) };
  }
  if (detail) result.files = fileRefs(source, refs);
  return result;
}

export function createPostWeb(context: WebContext): PostClient {
  const http = context.http;
  const details = new Map<string, WebEnvelope>();
  interface Thread { items: Row[]; refs: unknown[]; total: number; complete: boolean; }
  const threads = new Map<string, Thread>();
  async function load(id: string, projectId?: string, fresh = false): Promise<WebEnvelope> {
    let response = fresh ? undefined : details.get(id);
    if (!response) {
      response = await http.request(apiPath`wapi/task/v1/tasks/${id}`, { searchParams: { fields: "me,body" } });
      const source = row(response.result);
      if (identifier(source.id) !== id) return invalidResponse();
      count(source.number); identifier(source.projectId);
      details.set(id, response);
    }
    if (projectId !== undefined && identifier(row(response.result).projectId) !== projectId) {
      throw new DoorayCliError("지정한 프로젝트에 속한 업무가 아닙니다.", EXIT_PARAM_ERROR);
    }
    return response;
  }
  async function post(source: Row, refs: unknown): Promise<Post> {
    const projectId = identifier(source.projectId), projectMap = referenceMap(refs, "projectMap");
    const p = projectMap[projectId] ? row(projectMap[projectId]) : await context.project(projectId);
    const number = count(source.number), users = row(source.users);
    const workflowValue = source.workflow ?? referenceMap(refs, "workflowMap")[identifier(source.workflowId)];
    const result: Post = {
      id: identifier(source.id), subject: text(source.subject), project: { id: projectId, code: text(p.code) },
      taskNumber: `${text(p.code)}/${number}`, closed: source.workflowClass === "closed", number,
      createdAt: date(source.createdAt) ?? invalidResponse(), updatedAt: date(source.updatedAt) ?? invalidResponse(),
      priority: text(source.priority), workflowClass: text(source.workflowClass), workflow: workflow(workflowValue),
      tags: ids(source.tagIdList ?? []).map((id) => ({ id })), fileIdList: ids(source.fileIdList ?? []),
      users: { from: user(users.from, refs), to: rows(users.to).map((u) => user(u, refs)), cc: rows(users.cc).map((u) => user(u, refs)) },
    };
    for (const key of ["dueDate", "startedAt", "endedAt"]) if (source[key] !== undefined) Object.assign(result, { [key]: date(source[key]) });
    if (source.dueDateFlag !== undefined) {
      if (typeof source.dueDateFlag !== "boolean") return invalidResponse();
      result.dueDateFlag = source.dueDateFlag;
    }
    if (source.parent != null) {
      const parent = row(source.parent);
      result.parent = { id: identifier(parent.id), number: count(parent.number), subject: text(parent.subject) };
    }
    if (source.milestoneId != null) {
      const m = row(referenceMap(refs, "milestoneMap")[identifier(source.milestoneId)]);
      result.milestone = { id: identifier(m.id), name: text(m.name) };
    }
    return result;
  }
  async function getDetail(projectId: string | undefined, postId: string): Promise<Awaited<ReturnType<PostClient["getPost"]>>> {
    const response = await load(postId, projectId), source = row(response.result);
    const result: PostDetail = { ...await post(source, response.references), body: body(source.body), files: fileRefs(source, response.references) };
    return { header: response.header, result };
  }
  async function numbered(projectId: string, postId: string) {
    const response = await load(postId, projectId);
    return apiPath`v2/wapi/projects/!${projectId}/posts/${count(row(response.result).number)}`;
  }
  async function requestBody(input: CreatePostRequest | UpdatePostRequest, previous?: Row): Promise<Row> {
    if (input.dueDateFlag === false && previous?.dueDateFlag !== false) {
      throw new DoorayCliError("웹 방식에서는 일정 없음(dueDateFlag:false)을 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
    }
    if (previous?.users !== undefined) {
      const states = rows(row(previous.users).to).flatMap((u) => {
        const participant = u.type === "member" ? u.member : u.type === "group" ? u.group : undefined;
        const state = participant == null ? undefined : row(participant).workflowId;
        return state == null ? [] : [identifier(state)];
      });
      if (new Set(states).size > 1) {
        throw new DoorayCliError("웹 방식에서는 담당자별 진행 상태가 서로 다른 업무의 수정을 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
      }
    }
    const out: Row = {};
    for (const key of ["subject", "body", "priority", "dueDate", "dueDateFlag", "milestoneId", "version"]) {
      if (previous?.[key] !== undefined) out[key] = previous[key];
      if (input[key as keyof typeof input] !== undefined) out[key] = input[key as keyof typeof input];
    }
    const users = input.users !== undefined ? input.users : previous?.users;
    // 기존 웹 참여자도 공개 형태로 바꾼 뒤 요청을 만든다.
    if (users !== undefined) {
      if (input.users !== undefined) out.users = requestUsers(users, previous?.users);
      else {
        const raw = row(users);
        out.users = requestUsers({ to: rows(raw.to).map((v) => user(v, {})), cc: rows(raw.cc).map((v) => user(v, {})) }, previous?.users);
      }
    }
    out.tagIdList = input.tagIds !== undefined ? input.tagIds : previous?.tagIdList ?? [];
    out.fileIdList = previous?.fileIdList ?? [];
    // 기존 일정 없음 상태는 PUT에서 이 필드를 생략해 보존한다. false를 새로 설정하지 않는다.
    if (previous?.dueDateFlag === false && input.dueDateFlag !== true) delete out.dueDateFlag;
    return out;
  }
  async function mutation(projectId: string, postId: string, suffix: string, json: unknown, method = "POST") {
    const response = await http.request(`${await numbered(projectId, postId)}${suffix}`, { method, ...(json !== undefined && { json }) });
    details.delete(postId); threads.delete(postId);
    return response;
  }
  const methods: PostClient = {
    async getPosts(projectId, params = {}) {
      const { postWorkflowClasses, postWorkflowIds, ...rest } = params;
      const query: Record<string, string | number> = {};
      for (const [key, value] of Object.entries({ ...rest, workflowClass: postWorkflowClasses, workflowIds: postWorkflowIds })) {
        if (value !== undefined) query[key] = Array.isArray(value) ? value.join(",") : value;
      }
      const response = await http.request(apiPath`wapi/task/v1/projects/!${projectId}/tasks`, { searchParams: query });
      const result = [];
      for (const source of rows(response.result)) {
        if (identifier(source.projectId) !== projectId) return invalidResponse();
        result.push(await post(source, response.references));
      }
      return { header: response.header, result, totalCount: count(response.totalCount) };
    },
    getPost: (projectId, postId) => getDetail(projectId, postId),
    getPostStandalone: (postId) => getDetail(undefined, postId),
    async createPost(projectId, input) {
      const json = await requestBody(input);
      if (input.parentPostId !== undefined) json.parent = { number: count(row((await load(input.parentPostId, projectId)).result).number) };
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/posts`, { method: "POST", json: [json] });
      const created = rows(response.result);
      if (created.length !== 1) return invalidResponse();
      return { header: response.header, result: { id: identifier(created[0].id) } };
    },
    async updatePost(projectId, postId, input) {
      const previous = row((await load(postId, projectId, true)).result);
      const json = await requestBody(input, previous);
      const response = await mutation(projectId, postId, "", json, "PUT");
      return { header: response.header, result: null };
    },
    async setPostWorkflow(projectId, postId, workflowId) {
      const response = await mutation(projectId, postId, "/change-workflow", { workflowId });
      return { header: response.header, result: null };
    },
    async setPostDone(projectId, postId) {
      const response = await http.request(apiPath`v2/wapi/projects/!${projectId}/workflows`);
      const closed = rows(row(response.result).contents).filter((w) => w.class === "closed");
      if (!closed.length) return invalidResponse();
      if (closed.length > 1) {
        throw new DoorayCliError("웹 방식에서는 완료 상태가 여러 개인 프로젝트의 대표 상태를 확인할 수 없습니다. post workflow <상태>로 완료 상태를 명시하세요.", EXIT_PARAM_ERROR);
      }
      return methods.setPostWorkflow(projectId, postId, identifier(closed[0].id));
    },
    async setPostParent(projectId, postId, parentPostId) {
      const parent = row((await load(parentPostId, projectId)).result);
      const response = await mutation(projectId, postId, "/move", { targetProjectId: projectId, parentPostNumber: count(parent.number) });
      return { header: response.header, result: { post: { id: postId }, project: { id: projectId } } };
    },
    async getPostComments(projectId, postId, params = {}) {
      const page = count(params.page ?? 0), size = count(params.size ?? 20);
      if (!size) throw new DoorayCliError("댓글 페이지 크기는 0보다 커야 합니다.", EXIT_PARAM_ERROR);
      const descending = params.order === "-createdAt";
      let thread = threads.get(postId);
      await load(postId, projectId);
      let header: WebEnvelope["header"] | undefined;
      while (!thread || (!thread.complete && (!descending || thread.items.length < (page + 1) * size))) {
        const base = thread?.items.at(-1);
        const response = await http.request(apiPath`wapi/task/v1/projects/!${projectId}/tasks/${count(row((await load(postId, projectId)).result).number)}/events`, {
          searchParams: { size: Math.min(100, descending ? size : 100), order: "-createdAt", eventType: "comment", fields: "me", direction: base ? "<" : ":", ...(base && { baseEventId: identifier(base.id) }) },
        });
        header = response.header;
        const incoming = rows(response.result), total = count(response.totalCount);
        if (!thread) thread = { items: [], refs: [], total, complete: false };
        const seen = new Set(thread.items.map((item) => identifier(item.id)));
        for (const item of incoming) {
          if (identifier(item.postId) !== postId || seen.has(identifier(item.id))) return invalidResponse();
          seen.add(identifier(item.id)); thread.items.push(item); thread.refs.push(response.references);
        }
        thread.total = total;
        thread.complete = incoming.length === 0 || thread.items.length >= total;
        threads.set(postId, thread);
      }
      const ordered = thread!.items.map((item, i) => comment(item, thread!.refs[i], false)).sort((a, b) => {
        const difference = Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
        return descending ? -difference : difference;
      });
      return { header: header ?? (await load(postId, projectId)).header, result: ordered.slice(page * size, (page + 1) * size), totalCount: thread!.total };
    },
    async getPostComment(projectId, postId, logId) {
      await load(postId, projectId);
      const response = await http.request(apiPath`wapi/task/v1/tasks/${postId}/events/${logId}`);
      const source = row(response.result);
      if (identifier(source.id) !== logId || identifier(source.postId) !== postId) return invalidResponse();
      return { header: response.header, result: comment(source, response.references, true) };
    },
    async createPostComment(projectId, postId, input) {
      const response = await mutation(projectId, postId, "/events", [{ body: input.body, sendMailFlag: false, fileIdList: [] }]);
      const created = rows(response.result);
      if (created.length !== 1) return invalidResponse();
      return { header: response.header, result: { id: identifier(created[0].id) } };
    },
    async updatePostComment(projectId, postId, logId, input, options) {
      const original = await methods.getPostComment(projectId, postId, logId);
      const retained = (original.result.files ?? []).map((f) => f.id);
      // 일반 본문 수정은 카드 연결을 보존한다. 파일 삭제 명령이 지정한 ID만 제외한다.
      const fileIdList = retained.filter((id) => id !== options?.removeFileId);
      const response = await mutation(projectId, postId, apiPath`/events/${logId}`, { body: input.body, fileIdList }, "PUT");
      return { header: response.header, result: null };
    },
    async deletePostComment(projectId, postId, logId) {
      await methods.getPostComment(projectId, postId, logId);
      const response = await mutation(projectId, postId, apiPath`/events/${logId}`, undefined, "DELETE");
      return { header: response.header, result: null };
    },
    async getPostFiles(projectId, postId) {
      const response = await http.request(`${await numbered(projectId, postId)}/files`);
      const result = rows(row(response.result).content).map(file);
      return { header: response.header, result, totalCount: result.length };
    },
    async getPostFileMeta(projectId, postId, fileId) {
      const response = await methods.getPostFiles(projectId, postId);
      const result = response.result.find((f) => f.id === fileId);
      const task = row((await load(postId, projectId)).result);
      if (!result || !ids(task.fileIdList ?? []).includes(fileId)) throw new DoorayCliError("업무의 첨부 파일을 찾지 못했습니다.", EXIT_API_ERROR);
      return { header: response.header, result };
    },
    async downloadPostFile(projectId, postId, fileId, knownName) {
      const meta = await methods.getPostFileMeta(projectId, postId, fileId);
      const response = await http.requestBytes(apiPath`files/${fileId}`, { searchParams: { disposition: "attachment" } });
      const disposition = response.headers.get("content-disposition");
      const fileName = parseContentDispositionFileName(disposition) ?? fallbackFileName(fileId, knownName ?? meta.result.name, disposition);
      return { buffer: await response.arrayBuffer(), fileName };
    },
    async uploadPostFile(projectId, postId, filePath) {
      await load(postId, projectId);
      const form = new FormData();
      form.append("file", new Blob([await readFile(filePath)]), basename(filePath));
      const response = await http.upload(apiPath`wapi/task/v1/tasks/${postId}/files`, form, { searchParams: { type: "general" } });
      const uploaded = rows(response.result);
      if (uploaded.length !== 1) return invalidResponse();
      details.delete(postId);
      return { header: response.header, result: { id: identifier(uploaded[0].id) } };
    },
    async deletePostFile(projectId, postId, fileId) {
      await methods.getPostFileMeta(projectId, postId, fileId);
      const response = await mutation(projectId, postId, apiPath`/files/${fileId}`, undefined, "DELETE");
      return { header: response.header, result: null };
    },
  };
  return methods;
}
