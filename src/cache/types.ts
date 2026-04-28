export const PROJECTS_TTL_MS = 3_600_000; // 1h
export const MEMBERS_TTL_MS = 3_600_000; // 1h
export const WORKFLOWS_TTL_MS = 86_400_000; // 24h
export const ME_TTL_MS = 86_400_000; // 24h

export interface CacheEntry<T> {
  updatedAt: string;
  data: T;
}

export interface CachedMe {
  id: string;
  name: string;
}

export interface CachedProject {
  id: string;
  code: string;
  wikiId?: string;
}

export interface CachedMember {
  organizationMemberId: string;
  name: string;
}

export interface CachedWorkflow {
  id: string;
  name: string;
  class: "backlog" | "registered" | "working" | "closed";
  order?: number;
}

export const TAGS_TTL_MS = 86_400_000;       // 24h
export const MILESTONES_TTL_MS = 86_400_000; // 24h
export const RESOLVER_FETCH_PAGE_SIZE = 100;

export interface CachedTag {
  id: string;
  name: string;
  color: string;                 // 태그 색상 (hex, 예: "ffcedd")
  groupId: string | null;        // tagGroup.id (null이면 미소속)
  groupName: string | null;
  groupMandatory: boolean;       // mandatory 검증에 필요
  groupSelectOne: boolean;       // selectOne 검증에 필요
}

export interface CachedMilestone {
  id: string;
  name: string;
}

export const MEMBER_GROUPS_TTL_MS = 86_400_000; // 24h

export interface CachedMemberGroup {
  id: string;
  code: string;
}

export const WIKIS_TTL_MS = 86_400_000; // 24h — wiki home은 거의 불변

export interface CachedWiki {
  id: string;
  projectId: string;
  name: string;
  homePageId: string;
}
