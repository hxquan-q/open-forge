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
export { useWorkspaceMode } from "./hooks/useWorkspaceMode";
export { isWorkspaceModePath } from "./services/workspace-mode-paths";
