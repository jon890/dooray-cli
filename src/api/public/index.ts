/**
 * 공개 API(API 키) 구현을 영역별 구현으로 조립한다.
 * 각 영역은 createXxxPublic(http: PublicHttp) 가 자기 계약을 구현한 객체 리터럴을 반환한다.
 * 웹 구현의 api/web/index.ts 와 같은 꼴이다 (ADR-081, ADR-082).
 */
import type { DoorayClient } from "@/api/dooray-client.js";
import { PublicHttp } from "./http.js";
import { createProjectPublic } from "@/api/project/public.js";
import { createMemberPublic } from "@/api/member/public.js";
import { createPostPublic } from "@/api/post/public.js";
import { createWikiPublic } from "@/api/wiki/public.js";
import { createMessengerPublic } from "@/api/messenger/public.js";
import { createCalendarPublic } from "@/api/calendar/public.js";
import { createStreamPublic } from "@/api/stream/public.js";

/**
 * 영역 구현을 하나로 합친다. DoorayClient 타입을 붙인 객체를 거쳐야
 * 영역 하나를 빠뜨렸을 때 컴파일러가 잡는다.
 * 전개(spread)는 객체 리터럴의 속성만 복사하므로 영역 구현은 클래스 인스턴스를 반환하지 않는다.
 */
export function createPublicClient(http: PublicHttp): DoorayClient {
  const client: DoorayClient = {
    ...createProjectPublic(http),
    ...createMemberPublic(http),
    ...createPostPublic(http),
    ...createWikiPublic(http),
    ...createMessengerPublic(http),
    ...createCalendarPublic(http),
    ...createStreamPublic(http),
  };
  return client;
}

/**
 * 공개 API 클라이언트. 생성자 `(apiKey, baseUrl)` 와 클래스 이름은 `dooray-client.ts` 와
 * 테스트의 mock 이 쓰므로 지킨다. 안의 일은 createPublicClient 가 만든 결과를 복사만 한다.
 */
export interface DoorayApiClient extends DoorayClient {}
export class DoorayApiClient {
  constructor(apiKey: string, baseUrl: string) {
    Object.assign(this, createPublicClient(new PublicHttp(apiKey, baseUrl)));
  }
}
