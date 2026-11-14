/** 스킬 설치 대상·상태·결과와 주입하는 실행 환경의 타입. */


export type SkillStatusCode =
  | "missing"
  | "current"
  | "outdated"
  | "broken"
  | "unmanaged"
  | "modified"
  | "corrupt";

export const SKILL_AGENTS = ["claude", "codex"] as const;

export type SkillAgent = (typeof SKILL_AGENTS)[number];

export const SKILL_AGENT_NAMES: Record<SkillAgent, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

export interface SkillManagerContext {
  homeDir: string;
  packageRoot: string;
  currentVersion: string;
  dataRoot?: string;
}

export interface SkillStatus {
  schemaVersion: 1;
  status: SkillStatusCode;
  destination: string;
  source: string;
  currentVersion: string;
  installedVersion: string | null;
  linkTarget: string | null;
  managed: boolean;
}

export interface SkillsStatus extends SkillStatus {
  agents: Record<SkillAgent, SkillStatus>;
}

export interface SkillInstallResult {
  previous: SkillsStatus;
  current: SkillsStatus;
  changed: boolean;
  backupPath: string | null;
  backupPaths: Partial<Record<SkillAgent, string>>;
}
