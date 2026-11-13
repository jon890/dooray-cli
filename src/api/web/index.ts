/** 영역별 웹 메서드를 조립한다. 아직 옮기지 않은 메서드는 요청 없이 실패한다. */
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
} from "../types.js";
import type { GetPostsParams, GetProjectsParams, GetPostCommentsParams, GetMembersParams, SearchMembersParams, GetWikisParams } from "../client.js";
import type { DoorayClient } from "../dooray-client.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { WebContext } from "./context.js";
import { createProjectMethods } from "./project.js";
import { createMemberMethods } from "./member.js";

function unsupported(): never {
  throw new DoorayCliError("웹 방식에서는 지원하지 않습니다. auth-mode 를 api-key 로 바꾸세요.", EXIT_PARAM_ERROR);
}

export class DoorayWebClient implements DoorayClient {
  constructor(cookie: string, baseUrl: string) {
    const context = new WebContext(cookie, baseUrl);
    Object.assign(this,
      createProjectMethods(context),
      createMemberMethods(context),
    );
  }
  async getMe(): Promise<MeResponse> { return unsupported(); }
  async getProjects(params?: GetProjectsParams): Promise<ProjectListResponse> { return unsupported(); }
  async getPosts(projectId: string, params?: GetPostsParams): Promise<PostListResponse> { return unsupported(); }
  async getPost(projectId: string, postId: string): Promise<PostDetailResponse> { return unsupported(); }
  async getPostStandalone(postId: string): Promise<PostDetailResponse> { return unsupported(); }
  async createPost(projectId: string, body: CreatePostRequest): Promise<CreatePostApiResponse> { return unsupported(); }
  async updatePost(projectId: string, postId: string, body: UpdatePostRequest): Promise<UpdatePostResponse> { return unsupported(); }
  async setPostDone(projectId: string, postId: string): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async setPostWorkflow(projectId: string, postId: string, workflowId: string): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async setPostParent(projectId: string, postId: string, parentPostId: string): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async getPostComments(projectId: string, postId: string, params?: GetPostCommentsParams): Promise<PostCommentListResponse> { return unsupported(); }
  async getPostComment( projectId: string, postId: string, logId: string): Promise<PostCommentDetailResponse> { return unsupported(); }
  async createPostComment(projectId: string, postId: string, body: CreateCommentRequest): Promise<CreateCommentApiResponse> { return unsupported(); }
  async updatePostComment(projectId: string, postId: string, logId: string, body: UpdateCommentRequest): Promise<UpdateCommentResponse> { return unsupported(); }
  async deletePostComment(projectId: string, postId: string, logId: string): Promise<DeleteCommentResponse> { return unsupported(); }
  async getProjectMembers(projectId: string, params?: GetMembersParams): Promise<ProjectMemberListResponse> { return unsupported(); }
  async getMemberDetail(memberId: string): Promise<MemberDetailResponse> { return unsupported(); }
  async searchMembers(params: SearchMembersParams): Promise<MemberSearchResponse> { return unsupported(); }
  async getProjectWorkflows(projectId: string): Promise<ProjectWorkflowListResponse> { return unsupported(); }
  async getProjectTags( projectId: string, params?: { page?: number; size?: number }): Promise<TagListResponse> { return unsupported(); }
  async createProjectTag(projectId: string, body: CreateTagRequest): Promise<CreateTagApiResponse> { return unsupported(); }
  async updateProjectTagGroup( projectId: string, tagGroupId: string, body: UpdateTagGroupRequest): Promise<UpdateTagGroupResponse> { return unsupported(); }
  async getProjectMemberGroups( projectId: string, params?: { page?: number; size?: number }): Promise<MemberGroupListResponse> { return unsupported(); }
  async getProjectMilestones( projectId: string, params?: { page?: number; size?: number }): Promise<MilestoneListResponse> { return unsupported(); }
  async getWikis(params?: GetWikisParams): Promise<WikiListResponse> { return unsupported(); }
  async getWikiPages(wikiId: string, parentPageId?: string): Promise<WikiPagesResponse> { return unsupported(); }
  async getAllWikiPages(wikiId: string, maxDepth?: number): Promise<WikiPage[]> { return unsupported(); }
  async getWikiPage(wikiId: string, pageId: string): Promise<WikiPageResponse> { return unsupported(); }
  async getWikiPageStandalone(pageId: string): Promise<WikiPageResponse> { return unsupported(); }
  async createWikiPage(wikiId: string, body: CreateWikiPageRequest): Promise<CreateWikiPageResponse> { return unsupported(); }
  async updateWikiPage(wikiId: string, pageId: string, body: UpdateWikiPageRequest): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async updateWikiPageTitle( wikiId: string, pageId: string, body: UpdateWikiPageTitleRequest): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async updateWikiPageContent( wikiId: string, pageId: string, body: UpdateWikiPageContentRequest): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async deleteWikiPage(wikiId: string, pageId: string): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async moveWikiPage( wikiId: string, pageId: string, body: MoveWikiPageRequest): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async getPostFiles(projectId: string, postId: string): Promise<PostFileListResponse> { return unsupported(); }
  async getPostFileMeta(projectId: string, postId: string, fileId: string): Promise<PostFileMetaResponse> { return unsupported(); }
  async downloadPostFile( projectId: string, postId: string, fileId: string, knownName?: string): Promise<{ buffer: ArrayBuffer; fileName: string }> { return unsupported(); }
  async uploadPostFile(projectId: string, postId: string, filePath: string): Promise<UploadFileResponse> { return unsupported(); }
  async deletePostFile(projectId: string, postId: string, fileId: string): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async uploadWikiPageFile( wikiId: string, pageId: string, filePath: string, type: WikiPageFileType): Promise<UploadWikiPageFileResponse> { return unsupported(); }
  async downloadWikiPageFile( wikiId: string, pageId: string, fileId: string, knownName?: string): Promise<{ buffer: ArrayBuffer; fileName: string }> { return unsupported(); }
  async deleteWikiPageFile( wikiId: string, pageId: string, fileId: string): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async getWikiPageComments( wikiId: string, pageId: string, params?: { page?: number; size?: number }): Promise<WikiCommentListResponse> { return unsupported(); }
  async getWikiPageComment( wikiId: string, pageId: string, commentId: string): Promise<WikiCommentDetailResponse> { return unsupported(); }
  async addWikiPageComment( wikiId: string, pageId: string, body: CreateWikiCommentRequest): Promise<CreateWikiCommentApiResponse> { return unsupported(); }
  async updateWikiPageComment( wikiId: string, pageId: string, commentId: string, body: UpdateWikiCommentRequest): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async deleteWikiPageComment( wikiId: string, pageId: string, commentId: string): Promise<DoorayApiUnitResponse> { return unsupported(); }
  async getProjectTemplates( projectId: string, params?: { page?: number; size?: number }): Promise<TemplateListResponse> { return unsupported(); }
  async getProjectTemplateDetail( projectId: string, templateId: string, interpolation?: boolean): Promise<TemplateDetailResponse> { return unsupported(); }
  async sendDirectMessage( organizationMemberId: string, text: string): Promise<MessengerSendResponse> { return unsupported(); }
  async sendChannelMessage(channelId: string, text: string): Promise<MessengerSendResponse> { return unsupported(); }
  async getChannelLogs(channelId: string, size: number): Promise<MessengerLogListResponse> { return unsupported(); }
  async downloadMessengerFile( channelId: string, fileId: string): Promise<{ buffer: ArrayBuffer; fileName: string }> { return unsupported(); }
  async createChannelThread( channelId: string, text: string, threadText?: string): Promise<MessengerSendResponse> { return unsupported(); }
  async createLogThread( channelId: string, logId: string, text: string): Promise<MessengerSendResponse> { return unsupported(); }
  async getMessengerChannels(): Promise<MessengerChannelListResponse> { return unsupported(); }
  async getStreams(params?: GetStreamsParams): Promise<StreamListResponse> { return unsupported(); }
  async getCalendars(): Promise<CalendarListResponse> { return unsupported(); }
  async getCalendarEvents(timeMin: string, timeMax: string): Promise<CalendarEventListResponse> { return unsupported(); }
  async getCalendarEvent( calendarId: string, eventId: string): Promise<CalendarEventDetailResponse> { return unsupported(); }
  async createCalendarEvent( calendarId: string, body: CalendarEventWriteRequest): Promise<CreateCalendarEventResponse> { return unsupported(); }
  async updateCalendarEvent( calendarId: string, eventId: string, body: CalendarEventWriteRequest): Promise<UpdateCalendarEventResponse> { return unsupported(); }
  async deleteCalendarEvent( calendarId: string, eventId: string, deleteType: CalendarEventDeleteType): Promise<DeleteCalendarEventResponse> { return unsupported(); }
  async fetchBusyHours(request: BusyHoursRequest): Promise<BusyHoursResponse> { return unsupported(); }
}
