/** 공개 API 와 웹 세션 클라이언트의 공통 계약과 선택 함수다. */
import type {
  ProjectListResponse,
  PostListResponse,
  PostDetailResponse,
  CreatePostApiResponse,
  CreatePostRequest,
  UpdatePostRequest,
  UpdatePostResponse,
  SetWorkflowRequest,
  SetParentPostRequest,
  PostCommentListResponse,
  PostCommentDetailResponse,
  CreateCommentApiResponse,
  CreateCommentRequest,
  UpdateCommentRequest,
  UpdateCommentResponse,
  DeleteCommentResponse,
  ProjectMemberListResponse,
  ProjectWorkflowListResponse,
  MemberDetailResponse,
  MemberSearchResponse,
  MeResponse,
  TagListResponse,
  CreateTagRequest,
  CreateTagApiResponse,
  UpdateTagGroupRequest,
  UpdateTagGroupResponse,
  MilestoneListResponse,
  MemberGroupListResponse,
  WikiListResponse,
  WikiPage,
  WikiPagesResponse,
  WikiPageResponse,
  CreateWikiPageRequest,
  CreateWikiPageResponse,
  UpdateWikiPageRequest,
  UpdateWikiPageTitleRequest,
  UpdateWikiPageContentRequest,
  MoveWikiPageRequest,
  WikiPageFileType,
  UploadWikiPageFileResponse,
  WikiCommentListResponse,
  WikiCommentDetailResponse,
  CreateWikiCommentRequest,
  UpdateWikiCommentRequest,
  CreateWikiCommentApiResponse,
  DoorayApiUnitResponse,
  DoorayErrorResponse,
  PostFileListResponse,
  PostFileMetaResponse,
  UploadFileResponse,
  TemplateListResponse,
  TemplateDetailResponse,
  DirectSendRequest,
  ChannelLogRequest,
  MessengerSendResponse,
  MessengerChannelListResponse,
  MessengerLogListResponse,
  CalendarListResponse,
  CalendarEventListResponse,
  CalendarEventDetailResponse,
  CalendarEventWriteRequest,
  CreateCalendarEventResponse,
  UpdateCalendarEventResponse,
  CalendarEventDeleteType,
  DeleteCalendarEventResponse,
  StreamListResponse,
  GetStreamsParams,
  BusyHoursRequest,
  BusyHoursResponse,
} from "./types.js";
import type { GetPostsParams, GetProjectsParams, GetPostCommentsParams, GetMembersParams, SearchMembersParams, GetWikisParams } from "./client.js";
import type { Config } from "../config/types.js";
import { DoorayApiClient } from "./client.js";
import { DoorayWebClient } from "./web/index.js";
import { resolveWebBaseUrl, parseSessionCookie } from "../config/web-auth.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

export interface DoorayClient {
  getMe(): Promise<MeResponse>;
  getProjects(params?: GetProjectsParams): Promise<ProjectListResponse>;
  getPosts(projectId: string, params?: GetPostsParams): Promise<PostListResponse>;
  getPost(projectId: string, postId: string): Promise<PostDetailResponse>;
  getPostStandalone(postId: string): Promise<PostDetailResponse>;
  createPost(projectId: string, body: CreatePostRequest): Promise<CreatePostApiResponse>;
  updatePost(projectId: string, postId: string, body: UpdatePostRequest): Promise<UpdatePostResponse>;
  setPostDone(projectId: string, postId: string): Promise<DoorayApiUnitResponse>;
  setPostWorkflow(projectId: string, postId: string, workflowId: string): Promise<DoorayApiUnitResponse>;
  setPostParent(projectId: string, postId: string, parentPostId: string): Promise<DoorayApiUnitResponse>;
  getPostComments(projectId: string, postId: string, params?: GetPostCommentsParams): Promise<PostCommentListResponse>;
  getPostComment( projectId: string, postId: string, logId: string): Promise<PostCommentDetailResponse>;
  createPostComment(projectId: string, postId: string, body: CreateCommentRequest): Promise<CreateCommentApiResponse>;
  updatePostComment(projectId: string, postId: string, logId: string, body: UpdateCommentRequest): Promise<UpdateCommentResponse>;
  deletePostComment(projectId: string, postId: string, logId: string): Promise<DeleteCommentResponse>;
  getProjectMembers(projectId: string, params?: GetMembersParams): Promise<ProjectMemberListResponse>;
  getMemberDetail(memberId: string): Promise<MemberDetailResponse>;
  searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse>;
  getProjectWorkflows(projectId: string): Promise<ProjectWorkflowListResponse>;
  getProjectTags( projectId: string, params?: { page?: number; size?: number }): Promise<TagListResponse>;
  createProjectTag(projectId: string, body: CreateTagRequest): Promise<CreateTagApiResponse>;
  updateProjectTagGroup( projectId: string, tagGroupId: string, body: UpdateTagGroupRequest): Promise<UpdateTagGroupResponse>;
  getProjectMemberGroups( projectId: string, params?: { page?: number; size?: number }): Promise<MemberGroupListResponse>;
  getProjectMilestones( projectId: string, params?: { page?: number; size?: number }): Promise<MilestoneListResponse>;
  getWikis(params?: GetWikisParams): Promise<WikiListResponse>;
  getWikiPages(wikiId: string, parentPageId?: string): Promise<WikiPagesResponse>;
  getAllWikiPages(wikiId: string, maxDepth?: number): Promise<WikiPage[]>;
  getWikiPage(wikiId: string, pageId: string): Promise<WikiPageResponse>;
  getWikiPageStandalone(pageId: string): Promise<WikiPageResponse>;
  createWikiPage(wikiId: string, body: CreateWikiPageRequest): Promise<CreateWikiPageResponse>;
  updateWikiPage(wikiId: string, pageId: string, body: UpdateWikiPageRequest): Promise<DoorayApiUnitResponse>;
  updateWikiPageTitle( wikiId: string, pageId: string, body: UpdateWikiPageTitleRequest): Promise<DoorayApiUnitResponse>;
  updateWikiPageContent( wikiId: string, pageId: string, body: UpdateWikiPageContentRequest): Promise<DoorayApiUnitResponse>;
  deleteWikiPage(wikiId: string, pageId: string): Promise<DoorayApiUnitResponse>;
  moveWikiPage( wikiId: string, pageId: string, body: MoveWikiPageRequest): Promise<DoorayApiUnitResponse>;
  getPostFiles(projectId: string, postId: string): Promise<PostFileListResponse>;
  getPostFileMeta(projectId: string, postId: string, fileId: string): Promise<PostFileMetaResponse>;
  downloadPostFile( projectId: string, postId: string, fileId: string, knownName?: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  uploadPostFile(projectId: string, postId: string, filePath: string): Promise<UploadFileResponse>;
  deletePostFile(projectId: string, postId: string, fileId: string): Promise<DoorayApiUnitResponse>;
  uploadWikiPageFile( wikiId: string, pageId: string, filePath: string, type: WikiPageFileType): Promise<UploadWikiPageFileResponse>;
  downloadWikiPageFile( wikiId: string, pageId: string, fileId: string, knownName?: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  deleteWikiPageFile( wikiId: string, pageId: string, fileId: string): Promise<DoorayApiUnitResponse>;
  getWikiPageComments( wikiId: string, pageId: string, params?: { page?: number; size?: number }): Promise<WikiCommentListResponse>;
  getWikiPageComment( wikiId: string, pageId: string, commentId: string): Promise<WikiCommentDetailResponse>;
  addWikiPageComment( wikiId: string, pageId: string, body: CreateWikiCommentRequest): Promise<CreateWikiCommentApiResponse>;
  updateWikiPageComment( wikiId: string, pageId: string, commentId: string, body: UpdateWikiCommentRequest): Promise<DoorayApiUnitResponse>;
  deleteWikiPageComment( wikiId: string, pageId: string, commentId: string): Promise<DoorayApiUnitResponse>;
  getProjectTemplates( projectId: string, params?: { page?: number; size?: number }): Promise<TemplateListResponse>;
  getProjectTemplateDetail( projectId: string, templateId: string, interpolation?: boolean): Promise<TemplateDetailResponse>;
  sendDirectMessage( organizationMemberId: string, text: string): Promise<MessengerSendResponse>;
  sendChannelMessage(channelId: string, text: string): Promise<MessengerSendResponse>;
  getChannelLogs(channelId: string, size: number): Promise<MessengerLogListResponse>;
  downloadMessengerFile( channelId: string, fileId: string): Promise<{ buffer: ArrayBuffer; fileName: string }>;
  createChannelThread( channelId: string, text: string, threadText?: string): Promise<MessengerSendResponse>;
  createLogThread( channelId: string, logId: string, text: string): Promise<MessengerSendResponse>;
  getMessengerChannels(): Promise<MessengerChannelListResponse>;
  getStreams(params?: GetStreamsParams): Promise<StreamListResponse>;
  getCalendars(): Promise<CalendarListResponse>;
  getCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEventListResponse>;
  getCalendarEvent( calendarId: string, eventId: string): Promise<CalendarEventDetailResponse>;
  createCalendarEvent( calendarId: string, body: CalendarEventWriteRequest): Promise<CreateCalendarEventResponse>;
  updateCalendarEvent( calendarId: string, eventId: string, body: CalendarEventWriteRequest): Promise<UpdateCalendarEventResponse>;
  deleteCalendarEvent( calendarId: string, eventId: string, deleteType: CalendarEventDeleteType): Promise<DeleteCalendarEventResponse>;
  fetchBusyHours(request: BusyHoursRequest): Promise<BusyHoursResponse>;
}

export function createClient(config: Config): DoorayClient {
  if (config.authMode !== "web") return new DoorayApiClient(config.apiKey, config.baseUrl);
  const baseUrl = resolveWebBaseUrl(config);
  if (!config.sessionCookie) throw new DoorayCliError("SESSION 쿠키가 없습니다. dooray setup 을 실행하세요.", EXIT_CONFIG_ERROR);
  return new DoorayWebClient(parseSessionCookie(config.sessionCookie), baseUrl);
}
