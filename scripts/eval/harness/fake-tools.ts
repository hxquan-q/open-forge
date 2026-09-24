import { Type } from "@sinclair/typebox";
import type { CodingAgentSessionToolDefinition } from "@vetta/coding-agent/sdk";

const targetSchema = Type.Object({
	target: Type.Optional(Type.String()),
});

function fakeTool(
	name: string,
	label: string,
	description: string,
): CodingAgentSessionToolDefinition<typeof targetSchema, { readonly name: string }> {
	return {
		name,
		label,
		description,
		parameters: targetSchema,
		async execute(_toolCallId, params) {
			return {
				content: [{ type: "text", text: `${name} applied to ${params.target ?? "default"}` }],
				details: { name },
			};
		},
	};
}

export const ROUTING_EVAL_TOOL_NAMES = [
	"edit_website_theme",
	"vetta_appearance",
	"vetta_plugins_manage",
	"project_package_install",
	"project_scaffold",
	"vetta_batch_project",
	"vetta_projects_add",
	"project_code_edit",
	"vetta_scheduler_create",
	"vetta_scheduler_query",
	"skill_pdf",
	"session_todo",
	"vetta_board_create",
	"render_chart",
	"project_preview",
	"remotion_render",
] as const;

export type RoutingEvalToolName = (typeof ROUTING_EVAL_TOOL_NAMES)[number];

export function createRoutingEvalTools(): readonly CodingAgentSessionToolDefinition[] {
	return [
		fakeTool(
			"edit_website_theme",
			"Edit website theme",
			"Change the website project's theme or dark mode. Use this when the user wants the webpage or site to look dark.",
		),
		fakeTool(
			"vetta_appearance",
			"Vetta appearance",
			"Change the Vetta desktop app window appearance. Use this when the user wants the Vetta window or app UI theme changed.",
		),
		fakeTool(
			"vetta_plugins_manage",
			"Vetta plugins",
			"Install or manage Vetta application plugins. Use this when the user wants to install a Vetta plugin.",
		),
		fakeTool(
			"project_package_install",
			"Project package install",
			"Install an npm or Vite plugin into the current website project. Use this when the user wants a project-level Vite or npm plugin.",
		),
		fakeTool(
			"project_scaffold",
			"Project scaffold",
			"Create a new website or React project in the workspace. Use this when the user wants a code project scaffolded.",
		),
		fakeTool(
			"vetta_batch_project",
			"Vetta batch project",
			"Create a Vetta batch/automation project. Use this only when the user wants a Vetta batch job, not a normal React app.",
		),
		fakeTool(
			"vetta_projects_add",
			"Vetta projects add",
			"Add an existing directory to the Vetta sidebar project list. Use this when the user wants the folder shown in Vetta, not regenerated.",
		),
		fakeTool(
			"project_code_edit",
			"Project code edit",
			"Edit business code in the current website project, including cron, charts, or app components.",
		),
		fakeTool(
			"vetta_scheduler_create",
			"Vetta scheduler create",
			"Create a Vetta scheduled Agent task. Use this when the user wants Vetta itself to run on a schedule, including daily summaries, recurring digests, or '让 Vetta 每天…' style requests. Do not edit project cron code for these.",
		),
		fakeTool(
			"vetta_scheduler_query",
			"Vetta scheduler query",
			"Describe what Vetta scheduled tasks support. Use this when the user asks a capability question such as '定时任务支持什么', not when creating a task.",
		),
		fakeTool(
			"skill_pdf",
			"PDF skill",
			"Load the available PDF skill and process a PDF. Use this when the user wants to handle a PDF with the current skill.",
		),
		fakeTool(
			"session_todo",
			"Session todo",
			"Write a short execution plan in the current session todo list. Use this when the user wants a plan for this task, not a persistent board card.",
		),
		fakeTool(
			"vetta_board_create",
			"Vetta board create",
			"Add a card to the Vetta persistent board/kanban. Use this when the user wants the requirement tracked in Vetta.",
		),
		fakeTool(
			"render_chart",
			"Render chart",
			"Render a conversation chart. Use this when the user wants to visualize numbers in chat, not implement a chart component in the website.",
		),
		fakeTool(
			"project_preview",
			"Project preview",
			"Preview the current React/website project in its own preview flow. Do not use this for Remotion video export.",
		),
		fakeTool(
			"remotion_render",
			"Remotion render",
			"Export a Remotion composition to MP4. Use this only when the user wants a Remotion video rendered.",
		),
	];
}

export const ROUTING_EVAL_SYSTEM_PROMPT = [
	"You are in an isolated evaluation workspace with a small website project and a Remotion composition folder.",
	"When the user wants a stateful action, call exactly one tool that matches the target resource.",
	"If the user only asks a small factual question about numbers, answer in text and do not call a tool.",
	"Do not call a Vetta app tool for website/project work, and do not call a project tool for Vetta app work.",
	"If the user asks Vetta to do something on a schedule (每天汇总 / 定时帮我…), call vetta_scheduler_create; do not answer with only text and do not edit project cron code.",
	"If the user asks what Vetta scheduled tasks support (定时任务支持什么), call vetta_scheduler_query first; do not create a task.",
	"Do not create a Vetta scheduler, batch project, or board card when the user is asking about project code or only wants a session plan.",
	"Do not render a conversation chart when the user wants a chart component implemented in the website.",
	"When the user asks to draw/visualize numbers in chat, call render_chart.",
	"Do not use Remotion when the user only wants to preview the React website.",
].join(" ");
