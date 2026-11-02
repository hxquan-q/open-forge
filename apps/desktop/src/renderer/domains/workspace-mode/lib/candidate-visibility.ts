// Copyright The Open Forge contributors.
import type { WorkspaceMode } from "@shared/store/atoms";

/** Presentation-only mode filter; untagged product candidates remain visible in both modes. */
export function candidateVisibleInWorkspaceMode(
	candidateMode: WorkspaceMode | undefined,
	currentMode: WorkspaceMode,
): boolean {
	return candidateMode === undefined || candidateMode === currentMode;
}
