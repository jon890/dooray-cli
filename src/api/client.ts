/**
 * 공개 API 구현의 기존 진입점이다. 구현은 api/public/ 과 api/<영역>/public.ts 에 있다 (ADR-082).
 * dooray-client.ts 와 테스트의 mock 이 이 경로의 DoorayApiClient 를 가리키므로 재내보내기만 남긴다.
 */
export { DoorayApiClient } from "./public/index.js";
export type { GetPostsParams, GetPostCommentsParams } from "@/api/post/types.js";
export type { GetProjectsParams } from "@/api/project/types.js";
export type { GetMembersParams, SearchMembersParams } from "@/api/member/types.js";
export type { GetWikisParams } from "@/api/wiki/types.js";
