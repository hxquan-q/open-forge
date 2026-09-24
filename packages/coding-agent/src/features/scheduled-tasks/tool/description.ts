// Copyright The Open Forge contributors.
export const SCHEDULED_TASK_LIST_TOOL_DESCRIPTION = `List the scheduled (automated) tasks bound to the current project, with their cron schedule, enabled state, and last run result.

- This tool only manages scheduled tasks — it does not run commands or start an agent session immediately.
- Only tasks of the current project are visible; tasks created under other projects are never listed and cannot be referenced from here.
- Use the returned task ids with scheduled_task_update or scheduled_task_delete.`;

export const SCHEDULED_TASK_CREATE_TOOL_DESCRIPTION = `Create a scheduled task that runs a prompt as a background agent session on a cron schedule, bound to the current project.

Use this only when the user asks for recurring or future automation (e.g. "run the static checks every day at 2pm", "remind me every Monday"). It never executes the prompt right now — do the work directly in the conversation when the user wants immediate results.

- The task always executes in the current project directory; it cannot be pointed at another directory.
- A cron expression is required (e.g. "0 14 * * *" for 14:00 every day, in the host's local time). Set isOnce=true for a task that should auto-disable after its first successful run.
- The new task is enabled by default and appears in the Automation page where the user can review, pause, or delete it.`;

export const SCHEDULED_TASK_UPDATE_TOOL_DESCRIPTION = `Update an existing scheduled task bound to the current project. Only the fields you pass are changed — omit everything the user did not ask to modify.

- The task id must come from scheduled_task_list of this project; ids from other projects or unknown ids return NOT_FOUND.
- Use this to change the schedule (cron), the prompt, or to enable/disable a task.
- This tool only manages scheduled tasks — it does not trigger a run and does not edit project files.`;

export const SCHEDULED_TASK_DELETE_TOOL_DESCRIPTION = `Permanently delete a scheduled task bound to the current project, including its recorded run history.

- The task id must come from scheduled_task_list of this project; ids from other projects or unknown ids return NOT_FOUND.
- A task that is currently running cannot be deleted — ask the user to stop it or disable it with scheduled_task_update instead.
- Prefer disabling over deleting when the user may want the task back later.`;
