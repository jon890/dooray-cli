/**
 * 영역 계약을 갖춘 웹 구현을 조립한다. 아직 없는 영역은 요청 없이 실패한다.
 * 각 영역은 createXxxWeb(context: WebContext) 함수가 자기 계약을 구현한 객체 리터럴을 반환한다.
 * Object.assign 은 자신의 속성만 복사하므로 클래스 인스턴스·프로토타입 메서드를 반환하지 않는다.
 * 공통 변환은 web/convert.ts, 직접 쓴 응답 파일은 web/fixtures/<영역>/ 에 둔다.
 */
import type { DoorayClient } from "../dooray-client.js";
import type { ProjectClient } from "../project/types.js";
import type { MemberClient } from "../member/types.js";
import type { PostClient } from "../post/types.js";
import type { WikiClient } from "../wiki/types.js";
import type { MessengerClient } from "../messenger/types.js";
import type { CalendarClient } from "../calendar/types.js";
import type { StreamClient } from "../stream/types.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { WebContext } from "./context.js";
import { createProjectWeb } from "../project/web.js";
import { createMemberWeb } from "../member/web.js";

const unsupported = Symbol("unsupported web domain");
interface WebDomains {
  project: ProjectClient | typeof unsupported;
  member: MemberClient | typeof unsupported;
  post: PostClient | typeof unsupported;
  wiki: WikiClient | typeof unsupported;
  messenger: MessengerClient | typeof unsupported;
  calendar: CalendarClient | typeof unsupported;
  stream: StreamClient | typeof unsupported;
}

export function createWebClient(cookie: string, baseUrl: string, publicApiBaseUrl: string): DoorayClient {
  const context = new WebContext(cookie, baseUrl, publicApiBaseUrl);
  const domains: WebDomains = {
    project: createProjectWeb(context),
    member: createMemberWeb(context),
    post: unsupported,
    wiki: unsupported,
    messenger: unsupported,
    calendar: unsupported,
    stream: unsupported,
  };
  const methods = Object.assign({}, ...Object.values(domains).filter((value) => value !== unsupported));
  // 영역 구현은 각 영역 계약이 검사한다. 미지원 영역은 이 공통 경계가 모든 메서드를 막는다.
  return new Proxy(methods, {
    get(target, key, receiver) {
      // Promise.resolve / await 가 클라이언트를 thenable 로 오인하지 않게 한다.
      if (key === "then" || key === "getMemberNameFromList" && !Reflect.has(target, key)) return undefined;
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
      if (typeof key === "symbol") return undefined;
      return async () => { throw new DoorayCliError("웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR); };
    },
  }) as DoorayClient;
}
