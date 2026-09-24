import type { ToolResultReview } from "@vetta/runtime-storage/conversation";
import type { ToolPathHost } from "../../shared/path-resolution.js";
import type { ReviewSnapshotBinding } from "../../shared/review-capture.js";
export interface EditToolDetails {
	readonly diff: string;
	readonly firstChangedLine?: number;
	readonly appliedEdits?: number;
	/** 执行期审查快照元数据；未注入快照库或快照失败时缺省，旧记录兼容。 */
	readonly review?: ToolResultReview;
}

export interface EditOperations {
	readonly readFile: (absolutePath: string) => Promise<Buffer>;
	readonly writeFile: (absolutePath: string, content: string) => Promise<void>;
	readonly access: (absolutePath: string) => Promise<void>;
}

export interface EditPathPolicy {
	readonly getRejectionReason: (absolutePath: string) => string | undefined;
}

export interface EditToolOptions {
	readonly operations?: EditOperations;
	readonly pathPolicy: EditPathPolicy;
	/** 路径在哪台机器上解析；缺省为本机。远端项目必须换掉，见 {@link ToolPathHost}。 */
	readonly pathHost?: ToolPathHost;
	/** 会话级审查快照；缺省时工具不产出 `details.review`，行为与旧版一致。 */
	readonly reviewSnapshots?: ReviewSnapshotBinding;
}
