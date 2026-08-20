import { Command } from "commander";
import { getConfigOrThrow } from "../../config/store.js";
import { DoorayApiClient } from "../../api/client.js";
import { resolveProject } from "../../resolvers/project.js";
import { resolveTagGroup } from "../../resolvers/tag.js";
import { updateTagGroup } from "../../services/tag.js";
import { printJson, printQuiet, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { DoorayCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

export const projectTagsGroupCommand = new Command("group")
  .description("태그 그룹 속성 변경")
  .argument("<project>", "프로젝트 코드 또는 ID")
  .argument("<group>", "태그 그룹 이름")
  .option("--mandatory", "이 그룹에서 태그를 반드시 하나 고르게 한다")
  .option("--no-mandatory", "필수 지정을 해제한다")
  .option("--select-one", "이 그룹에서 태그를 하나만 고르게 한다")
  .option("--no-select-one", "단일 선택을 해제한다")
  .action(async (project: string, group: string) => {
    // --no- 접두를 함께 등록하면 미지정 시 opts() 에 키가 없다. undefined 로 지정 여부를 가른다.
    const opts = projectTagsGroupCommand.opts<{ mandatory?: boolean; selectOne?: boolean }>();
    const globalOpts = projectTagsGroupCommand.optsWithGlobals() as OutputOptions;

    if (opts.mandatory === undefined && opts.selectOne === undefined) {
      throw new DoorayCliError(
        "바꿀 속성을 지정하세요: --mandatory / --no-mandatory / --select-one / --no-select-one",
        EXIT_PARAM_ERROR,
      );
    }

    const config = await getConfigOrThrow();
    const client = new DoorayApiClient(config.apiKey, config.baseUrl);

    startSpinner("태그 그룹 변경 중...");
    let resolved;
    let mandatory: boolean;
    let selectOne: boolean;
    try {
      const projectId = await resolveProject(client, project);
      resolved = await resolveTagGroup(client, projectId, group);
      // PUT tag-groups 가 두 필드를 함께 받는다. 지정하지 않은 쪽은 현재 값을 실어 보내야 초기화되지 않는다.
      mandatory = opts.mandatory ?? resolved.mandatory;
      selectOne = opts.selectOne ?? resolved.selectOne;
      await updateTagGroup(client, projectId, resolved.id, { mandatory, selectOne });
    } catch (e) {
      stopSpinner(false, "태그 그룹 변경 실패");
      throw e;
    }
    stopSpinner(true, "태그 그룹 변경 완료");

    // PUT 응답의 result 가 null 이라 서버가 바뀐 값을 돌려주지 않는다. 보낸 값으로 출력을 만든다.
    if (globalOpts.json) {
      printJson({ id: resolved.id, name: resolved.name, mandatory, selectOne });
    } else if (globalOpts.quiet) {
      printQuiet([resolved.id]);
    } else {
      process.stdout.write(
        `태그 그룹이 변경되었습니다: ${resolved.name} ` +
          `(필수 ${mandatory ? "Y" : "N"}, 단일 선택 ${selectOne ? "Y" : "N"})\n`,
      );
    }
  });
