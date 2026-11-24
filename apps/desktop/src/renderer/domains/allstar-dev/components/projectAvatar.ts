// Modified by The Open Forge contributors.

/** 项目首字母块的浅色 token 组；按项目名 hash 稳定取色，同名恒定同色。 */
const PROJECT_AVATAR_STYLES = [
	"bg-chart-1/15 text-chart-1",
	"bg-chart-2/15 text-chart-2",
	"bg-chart-3/15 text-chart-3",
	"bg-chart-4/15 text-chart-4",
	"bg-chart-5/15 text-chart-5",
] as const;

export function projectAvatarStyle(projectName: string): string {
	let hash = 0;
	for (let index = 0; index < projectName.length; index += 1) {
		hash = (hash * 31 + projectName.charCodeAt(index)) | 0;
	}
	return PROJECT_AVATAR_STYLES[Math.abs(hash) % PROJECT_AVATAR_STYLES.length];
}

export function projectInitial(projectName: string): string {
	const first = projectName.trim().charAt(0);
	return first.toUpperCase() || "·";
}
