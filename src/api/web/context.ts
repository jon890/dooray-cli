/** 한 CLI 실행 안에서 멤버·프로젝트 참조를 공유해 불필요한 웹 호출을 줄인다. */
import { WebHttp } from "../web-http.js";
import { apiPath } from "../api-path.js";
import type { MemberDetail, Project } from "../types.js";
import { project, row } from "./convert.js";

export class WebContext {
  readonly http: WebHttp;
  readonly members = new Map<string, MemberDetail>();
  readonly projects = new Map<string, Project>();
  private readonly projectRequests = new Map<string, Promise<Project>>();
  constructor(cookie: string, baseUrl: string) { this.http = new WebHttp(baseUrl, cookie); }
  async project(id: string): Promise<Project> {
    const cached = this.projects.get(id);
    if (cached) return cached;
    const pending = this.projectRequests.get(id);
    if (pending) return pending;
    const request = this.http.request(apiPath`v2/wapi/projects/!${id}`).then((response) => {
      const result = project(row(response.result).content);
      this.projects.set(id, result);
      return result;
    }).finally(() => this.projectRequests.delete(id));
    this.projectRequests.set(id, request);
    return request;
  }
}
