import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { createTag } from "../../services/tag.js";
import { printJson, printQuiet, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const DEFAULT_TAG_COLOR = "e0e0e0";

/**
 * `#` 을 하나 벗기고 6자리 hex 인지 검사해 소문자로 돌려준다.
 * 생략하면 기본값을 쓴다 — 공식 문서 예시의 ffffff 는 흰 배경과 구분되지 않는다.
 */
export function normalizeTagColor(input: string | undefined): string {
  if (input === undefined) return DEFAULT_TAG_COLOR;
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_TAG_COLOR;
  const stripped = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(stripped)) {
    throw new DoorayCliError(
      `색상 형식이 올바르지 않습니다: "${input}"\n6자리 hex 를 지정하세요 (예: c6eab3 또는 #c6eab3)`,
      EXIT_PARAM_ERROR,
    );
  }
  return stripped.toLowerCase();
}

export const projectTagsCreateCommand = new Command("create")
  .description("프로젝트 태그 생성")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .option("--name <name>", '태그 이름 ("<그룹>:<태그>" 형식, 그룹 생략 가능) — 필수')
  .option("--color <hex>", `태그 색상 (6자리 hex, 기본값 ${DEFAULT_TAG_COLOR})`)
  .action(async (project: string) => {
    // --name 과 --color 는 이 명령의 opts() 로 읽는다.
    // optsWithGlobals() 는 전역 --no-color 가 --color 를 덮어써 값이 조용히 버려진다.
    const opts = projectTagsCreateCommand.opts<{ name?: string; color?: string }>();
    const globalOpts = projectTagsCreateCommand.optsWithGlobals() as OutputOptions;

    const name = (opts.name ?? "").trim();
    if (!name) {
      throw new DoorayCliError(
        '--name 이 필요합니다 (예: --name "배포환경:staging")',
        EXIT_PARAM_ERROR,
      );
    }
    const color = normalizeTagColor(opts.color);

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("태그 생성 중...");
    let tagId: string;
    try {
      const projectId = await resolveProject(client, project);
      tagId = await createTag(client, projectId, { name, color });
    } catch (e) {
      stopSpinner(false, "태그 생성 실패");
      throw e;
    }
    stopSpinner(true, "태그 생성 완료");

    if (globalOpts.json) {
      printJson({ id: tagId, name, color });
    } else if (globalOpts.quiet) {
      printQuiet([tagId]);
    } else {
      process.stdout.write(`태그가 생성되었습니다: ${name} (${tagId})\n`);
    }
  });
