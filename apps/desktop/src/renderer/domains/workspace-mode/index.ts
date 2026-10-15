// Copyright The Open Forge contributors.
export type { WorkDocumentSectionsProps } from "./components/WorkDocumentSections";
export { WorkDocumentSections } from "./components/WorkDocumentSections";
export { WorkspaceModeSwitcher } from "./components/WorkspaceModeSwitcher";
export type {
	WorkPanelSectionId,
	WorkPanelSectionProps,
	WorkPanelSectionState,
	WorkWorkspacePanelProps,
} from "./components/WorkWorkspacePanel";
export { WORK_PANEL_SECTIONS, WorkPanelSection, WorkWorkspacePanel } from "./components/WorkWorkspacePanel";
export { useTaskProjection } from "./hooks/useTaskProjection";
export { useWorkspaceMode } from "./hooks/useWorkspaceMode";
export { useWorkspaceRightPanel } from "./hooks/useWorkspaceRightPanel";
export {
	resolveWorkspaceRightPanel,
	sessionAxesBadgeKind,
	WORKSPACE_MODE_ICON,
} from "./lib/workspace-session-flow";
export { isWorkspaceModePath } from "./services/workspace-mode-paths";
