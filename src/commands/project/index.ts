import { Command } from "commander";
import { projectListCommand } from "./list.js";
import { projectMembersCommand } from "./members.js";
import { projectWorkflowsCommand } from "./workflows.js";
import { projectGroupsCommand } from "./groups.js";
import { projectTagsCommand, projectTagsListCommand } from "./tags.js";
import { projectTagsCreateCommand } from "./tags-create.js";
import { projectTagsGroupCommand } from "./tags-group.js";
import { projectTemplatesCommand } from "./templates.js";

export const projectCommand = new Command("project").description("프로젝트 관련 명령");

projectCommand.addCommand(projectListCommand);
projectCommand.addCommand(projectMembersCommand);
projectCommand.addCommand(projectWorkflowsCommand);
projectCommand.addCommand(projectGroupsCommand);
projectCommand.addCommand(projectTagsCommand);
projectCommand.addCommand(projectTemplatesCommand);

projectTagsCommand.addCommand(projectTagsListCommand);
projectTagsCommand.addCommand(projectTagsCreateCommand);
projectTagsCommand.addCommand(projectTagsGroupCommand);
