import { readFile, writeFile, rm, mkdir, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type {
  CacheEntry,
  CachedMe,
  CachedProject,
  CachedMember,
  CachedWorkflow,
  CachedTag,
  CachedMilestone,
  CachedWiki,
  CachedMemberGroup,
  CachedTemplate,
} from "./types.js";

/** 캐시 루트. 오류 메시지에 경로를 실어야 하는 호출부가 있어 내보낸다. */
export const CACHE_DIR = join(homedir(), ".dooray", "cache");
const ME_PATH = join(CACHE_DIR, "me.json");
const PROJECTS_PATH = join(CACHE_DIR, "projects.json");
const PROJECTS_PRIVATE_PATH = join(CACHE_DIR, "projects-private.json");
const MEMBERS_DIR = join(CACHE_DIR, "members");
const WORKFLOWS_DIR = join(CACHE_DIR, "workflows");
const TAGS_DIR = join(CACHE_DIR, "tags");
const MILESTONES_DIR = join(CACHE_DIR, "milestones");
const MEMBER_GROUPS_DIR = join(CACHE_DIR, "member-groups");
const WIKIS_PATH = join(CACHE_DIR, "wikis.json");
const TEMPLATES_DIR = join(CACHE_DIR, "templates");

// ─── Helpers ──────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const dir = dirname(path);
  await ensureDir(dir);
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

export function isExpired(updatedAt: string, ttlMs: number): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > ttlMs;
}

function now(): string {
  return new Date().toISOString();
}

// ─── Me ───────────────────────────────────────────────────

export async function getMe(): Promise<CacheEntry<CachedMe> | null> {
  return readJson<CacheEntry<CachedMe>>(ME_PATH);
}

export async function setMe(data: CachedMe): Promise<void> {
  await writeJson(ME_PATH, { updatedAt: now(), data } satisfies CacheEntry<CachedMe>);
}

// ─── Projects ─────────────────────────────────────────────

export async function getProjects(): Promise<CacheEntry<CachedProject[]> | null> {
  return readJson<CacheEntry<CachedProject[]>>(PROJECTS_PATH);
}

export async function setProjects(items: CachedProject[]): Promise<void> {
  await writeJson(PROJECTS_PATH, { updatedAt: now(), data: items } satisfies CacheEntry<CachedProject[]>);
}

export async function getPrivateProjects(): Promise<CacheEntry<CachedProject[]> | null> {
  return readJson<CacheEntry<CachedProject[]>>(PROJECTS_PRIVATE_PATH);
}

export async function setPrivateProjects(items: CachedProject[]): Promise<void> {
  await writeJson(PROJECTS_PRIVATE_PATH, { updatedAt: now(), data: items } satisfies CacheEntry<CachedProject[]>);
}

// ─── Members (per project) ────────────────────────────────

function membersPath(projectId: string): string {
  return join(MEMBERS_DIR, `${projectId}.json`);
}

export async function getMembers(projectId: string): Promise<CacheEntry<CachedMember[]> | null> {
  return readJson<CacheEntry<CachedMember[]>>(membersPath(projectId));
}

export async function setMembers(projectId: string, items: CachedMember[]): Promise<void> {
  await writeJson(membersPath(projectId), { updatedAt: now(), data: items } satisfies CacheEntry<CachedMember[]>);
}

// ─── Workflows (per project) ──────────────────────────────

function workflowsPath(projectId: string): string {
  return join(WORKFLOWS_DIR, `${projectId}.json`);
}

export async function getWorkflows(projectId: string): Promise<CacheEntry<CachedWorkflow[]> | null> {
  return readJson<CacheEntry<CachedWorkflow[]>>(workflowsPath(projectId));
}

export async function setWorkflows(projectId: string, items: CachedWorkflow[]): Promise<void> {
  await writeJson(workflowsPath(projectId), { updatedAt: now(), data: items } satisfies CacheEntry<CachedWorkflow[]>);
}

// ─── Tags (per project) ──────────────────────────────

function tagsPath(projectId: string): string {
  return join(TAGS_DIR, `${projectId}.json`);
}

export async function getTags(projectId: string): Promise<CacheEntry<CachedTag[]> | null> {
  return readJson<CacheEntry<CachedTag[]>>(tagsPath(projectId));
}

export async function setTags(projectId: string, items: CachedTag[]): Promise<void> {
  await writeJson(tagsPath(projectId), { updatedAt: now(), data: items } satisfies CacheEntry<CachedTag[]>);
}

/** 태그를 만들거나 태그 그룹을 바꾼 뒤 그 프로젝트의 태그 캐시를 지운다 (ADR-042) */
export async function clearTags(projectId: string): Promise<void> {
  await rm(tagsPath(projectId), { force: true });
}

// ─── Milestones (per project) ─────────────────────────

function milestonesPath(projectId: string): string {
  return join(MILESTONES_DIR, `${projectId}.json`);
}

export async function getMilestones(projectId: string): Promise<CacheEntry<CachedMilestone[]> | null> {
  return readJson<CacheEntry<CachedMilestone[]>>(milestonesPath(projectId));
}

export async function setMilestones(projectId: string, items: CachedMilestone[]): Promise<void> {
  await writeJson(milestonesPath(projectId), { updatedAt: now(), data: items } satisfies CacheEntry<CachedMilestone[]>);
}

// ─── Member Groups (per project) ─────────────────────────

function memberGroupsPath(projectId: string): string {
  return join(MEMBER_GROUPS_DIR, `${projectId}.json`);
}

export async function getMemberGroups(projectId: string): Promise<CacheEntry<CachedMemberGroup[]> | null> {
  return readJson<CacheEntry<CachedMemberGroup[]>>(memberGroupsPath(projectId));
}

export async function setMemberGroups(projectId: string, items: CachedMemberGroup[]): Promise<void> {
  await writeJson(memberGroupsPath(projectId), { updatedAt: now(), data: items } satisfies CacheEntry<CachedMemberGroup[]>);
}

// ─── Templates (per project) ─────────────────────────────

function templatesPath(projectId: string): string {
  return join(TEMPLATES_DIR, `${projectId}.json`);
}

export async function getTemplates(projectId: string): Promise<CacheEntry<CachedTemplate[]> | null> {
  return readJson<CacheEntry<CachedTemplate[]>>(templatesPath(projectId));
}

export async function setTemplates(projectId: string, items: CachedTemplate[]): Promise<void> {
  await writeJson(templatesPath(projectId), { updatedAt: now(), data: items } satisfies CacheEntry<CachedTemplate[]>);
}

// ─── Wikis ────────────────────────────────────────────────

export async function getWikis(): Promise<CacheEntry<CachedWiki[]> | null> {
  return readJson<CacheEntry<CachedWiki[]>>(WIKIS_PATH);
}

export async function setWikis(items: CachedWiki[]): Promise<void> {
  await writeJson(WIKIS_PATH, { updatedAt: now(), data: items } satisfies CacheEntry<CachedWiki[]>);
}

// ─── Clear ────────────────────────────────────────────────

/**
 * 캐시 디렉터리를 통째로 지운다. 지운 것이 있었으면 `true` 다.
 *
 * 삭제에 실패하면 원래 오류를 그대로 던진다. `DoorayCliError` 로 감싸지 않는 이유는
 * 부르는 쪽마다 처리가 다르기 때문이다 (ADR-042).
 * `dooray cache clear` 는 사용자가 명시적으로 요청한 작업이라 실패를 에러로 노출하고,
 * `services/config.ts` 의 무효화는 부수 작업이라 경고만 낸다.
 *
 * 반환값으로 부재와 삭제를 가르는 이유는 안내 때문이다.
 * 지울 캐시가 없었는데 비웠다고 알리면 처음 쓰는 사용자에게 없는 이야기를 꺼내게 된다.
 */
export async function clearCache(): Promise<boolean> {
  const existed = await cacheDirExists();
  await rm(CACHE_DIR, { recursive: true, force: true });
  return existed;
}

/** 캐시 디렉터리 존재 여부. `ENOENT` 만 부재로 보고 나머지 오류는 그대로 던진다. */
async function cacheDirExists(): Promise<boolean> {
  try {
    await stat(CACHE_DIR);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

// ─── Stats (for doctor) ──────────────────────────────────

export async function getCacheStats(): Promise<{
  projectCount: number;
  memberProjectCount: number;
  workflowProjectCount: number;
  tagProjectCount: number;
  milestoneProjectCount: number;
  memberGroupProjectCount: number;
  me: CachedMe | null;
}> {
  const projects = await getProjects();
  const projectCount = projects?.data.length ?? 0;

  let memberProjectCount = 0;
  try {
    const files = await readdir(MEMBERS_DIR);
    memberProjectCount = files.filter((f) => f.endsWith(".json")).length;
  } catch { /* dir doesn't exist */ }

  let workflowProjectCount = 0;
  try {
    const files = await readdir(WORKFLOWS_DIR);
    workflowProjectCount = files.filter((f) => f.endsWith(".json")).length;
  } catch { /* dir doesn't exist */ }

  let tagProjectCount = 0;
  try {
    const files = await readdir(TAGS_DIR);
    tagProjectCount = files.filter((f) => f.endsWith(".json")).length;
  } catch { /* dir doesn't exist */ }

  let milestoneProjectCount = 0;
  try {
    const files = await readdir(MILESTONES_DIR);
    milestoneProjectCount = files.filter((f) => f.endsWith(".json")).length;
  } catch { /* dir doesn't exist */ }

  let memberGroupProjectCount = 0;
  try {
    const files = await readdir(MEMBER_GROUPS_DIR);
    memberGroupProjectCount = files.filter((f) => f.endsWith(".json")).length;
  } catch { /* dir doesn't exist */ }

  const me = await getMe();

  return { projectCount, memberProjectCount, workflowProjectCount, tagProjectCount, milestoneProjectCount, memberGroupProjectCount, me: me?.data ?? null };
}
