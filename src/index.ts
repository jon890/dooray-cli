import { Command } from "commander";
import chalk from "chalk";
import { configCommand } from "./commands/config.js";
import { cacheCommand } from "./commands/cache.js";
import { doctorCommand } from "./commands/doctor.js";
import { setupCommand } from "./commands/setup.js";
import { projectListCommand } from "./commands/project/list.js";
import { projectMembersCommand } from "./commands/project/members.js";
import { projectWorkflowsCommand } from "./commands/project/workflows.js";
import { projectGroupsCommand } from "./commands/project/groups.js";
import { projectTagsCommand } from "./commands/project/tags.js";
import { postListCommand } from "./commands/post/list.js";
import { postSearchCommand } from "./commands/post/search.js";
import { postGetCommand } from "./commands/post/get.js";
import { postEditCommand } from "./commands/post/edit.js";
import { postCreateCommand } from "./commands/post/create.js";
import { postDoneCommand } from "./commands/post/done.js";
import { postWorkflowCommand } from "./commands/post/workflow.js";
import { commentListCommand } from "./commands/post/comment/list.js";
import { commentAddCommand } from "./commands/post/comment/add.js";
import { commentEditCommand } from "./commands/post/comment/edit.js";
import { commentDeleteCommand } from "./commands/post/comment/delete.js";
import { fileListCommand } from "./commands/post/file/list.js";
import { fileDownloadCommand } from "./commands/post/file/download.js";
import { fileDownloadAllCommand } from "./commands/post/file/download-all.js";
import { fileUploadCommand } from "./commands/post/file/upload.js";
import { fileDeleteCommand } from "./commands/post/file/delete.js";
import { wikiListCommand } from "./commands/wiki/list.js";
import { wikiPagesCommand } from "./commands/wiki/pages.js";
import { wikiPageGetCommand } from "./commands/wiki/page-get.js";
import { wikiPageCreateCommand } from "./commands/wiki/page-create.js";
import { wikiPageEditCommand } from "./commands/wiki/page-edit.js";
import { memberCommand } from "./commands/member/index.js";
import { mailListCommand } from "./commands/mail/list.js";
import { mailGetCommand } from "./commands/mail/get.js";
import { mailSendCommand } from "./commands/mail/send.js";
import { mailReplyCommand } from "./commands/mail/reply.js";
import { feedbackCommand } from "./commands/feedback.js";
import { DoorayCliError } from "./utils/errors.js";

const program = new Command();

program
  .name("dooray")
  .description("Dooray REST API CLI")
  .version("0.5.3")
  .option("--json", "JSON 형식으로 출력")
  .option("--quiet", "ID만 출력")
  .option("--no-color", "색상 비활성화");

// --no-color 처리: chalk 비활성화
program.hook("preAction", () => {
  const opts = program.opts();
  if (opts.color === false || process.env.NO_COLOR) {
    chalk.level = 0;
  }
});

// project 커맨드 그룹
const projectCommand = new Command("project").description("프로젝트 관련 명령");
projectCommand.addCommand(projectListCommand);
projectCommand.addCommand(projectMembersCommand);
projectCommand.addCommand(projectWorkflowsCommand);
projectCommand.addCommand(projectGroupsCommand);
projectCommand.addCommand(projectTagsCommand);

// post 커맨드 그룹
const postCommand = new Command("post").description("업무 관련 명령");
postCommand.addCommand(postListCommand);
postCommand.addCommand(postSearchCommand);
postCommand.addCommand(postGetCommand);
postCommand.addCommand(postEditCommand);
postCommand.addCommand(postCreateCommand);
postCommand.addCommand(postDoneCommand);
postCommand.addCommand(postWorkflowCommand);

// comment 서브커맨드 그룹
const commentCommand = new Command("comment").description("댓글 관련 명령");
commentCommand.addCommand(commentListCommand);
commentCommand.addCommand(commentAddCommand);
commentCommand.addCommand(commentEditCommand);
commentCommand.addCommand(commentDeleteCommand);
postCommand.addCommand(commentCommand);

// file 서브커맨드 그룹
const fileCommand = new Command("file").description("첨부파일 관련 명령");
fileCommand.addCommand(fileListCommand);
fileCommand.addCommand(fileDownloadCommand);
fileCommand.addCommand(fileDownloadAllCommand);
fileCommand.addCommand(fileUploadCommand);
fileCommand.addCommand(fileDeleteCommand);
postCommand.addCommand(fileCommand);

// wiki 커맨드 그룹
const wikiCommand = new Command("wiki").description("위키 관련 명령");
wikiCommand.addCommand(wikiListCommand);
wikiCommand.addCommand(wikiPagesCommand);

// wiki page 서브커맨드 그룹
const wikiPageCommand = new Command("page").description("위키 페이지 관련 명령");
wikiPageCommand.addCommand(wikiPageGetCommand);
wikiPageCommand.addCommand(wikiPageCreateCommand);
wikiPageCommand.addCommand(wikiPageEditCommand);
wikiCommand.addCommand(wikiPageCommand);

// mail 커맨드 그룹
const mailCommand = new Command("mail").description("메일 관련 명령");
mailCommand.addCommand(mailListCommand);
mailCommand.addCommand(mailGetCommand);
mailCommand.addCommand(mailSendCommand);
mailCommand.addCommand(mailReplyCommand);

program.addCommand(setupCommand);
program.addCommand(configCommand);
program.addCommand(memberCommand);
program.addCommand(cacheCommand);
program.addCommand(doctorCommand);
program.addCommand(projectCommand);
program.addCommand(postCommand);
program.addCommand(wikiCommand);
program.addCommand(mailCommand);
program.addCommand(feedbackCommand);

program.parseAsync().catch((err) => {
  if (err instanceof DoorayCliError) {
    process.stderr.write(chalk.red(`오류: ${err.message}`) + "\n");
    process.exit(err.exitCode);
  }
  process.stderr.write(chalk.red(`오류: ${err.message}`) + "\n");
  process.exit(1);
});
