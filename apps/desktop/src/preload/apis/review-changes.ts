import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNEL = "vetta:review-changes:rollback";

export function createReviewChangesApi(ipc: IpcRenderer): Pick<DesktopApi, "reviewChanges"> {
	return {
		reviewChanges: {
			rollback: (input) => ipc.invoke(CHANNEL, input),
		},
	};
}
