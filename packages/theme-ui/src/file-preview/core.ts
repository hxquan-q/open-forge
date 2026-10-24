// Copyright The Open Forge contributors.
// Copyright The Open Forge contributors.
export type {
	FilePreviewDialogViewLabels,
	FilePreviewDialogViewProps,
} from "./FilePreviewDialogView";
export {
	FilePreviewDialogView,
	OverlayArrow,
	OverlayButton,
	ThumbnailView,
} from "./FilePreviewDialogView";
export type { FilePreviewViewLabels, FilePreviewViewProps } from "./FilePreviewView";
export { FilePreviewView } from "./FilePreviewView";
export { isEditableKeyboardTarget } from "./keyboard-target";
export type { LightboxImageViewProps } from "./LightboxImageView";
export { LightboxImageView } from "./LightboxImageView";
export type { PluginFilePreviewViewProps } from "./PluginFilePreviewView";
export { PluginFilePreviewView } from "./PluginFilePreviewView";
export type {
	PreviewBodyViewLabels,
	PreviewBodyViewProps,
	PreviewBodyViewState,
} from "./PreviewBodyView";
export { PreviewBodyView } from "./PreviewBodyView";
export type { PreviewErrorBoundaryProps } from "./PreviewErrorBoundary";
export { PreviewErrorBoundary } from "./PreviewErrorBoundary";
export type { SyntaxTokenId } from "./syntax-tokens";
export {
	SYNTAX_PALETTE_VSCODE_DARK,
	SYNTAX_PALETTE_VSCODE_LIGHT,
	SYNTAX_TOKEN_CSS_VARS,
	SYNTAX_TOKEN_IDS,
	syntaxPaletteToCssDeclarations,
	syntaxVar,
} from "./syntax-tokens";
export { getTextEditorLanguageId, normalizeFileExtension } from "./text-editor-language-id";
export type { FilePreviewContext, FilePreviewItem, FilePreviewKind } from "./types";
export {
	AUDIO_EXTENSIONS,
	getExtension,
	getPreviewLabel,
	IMAGE_EXTENSIONS,
	VIDEO_EXTENSIONS,
} from "./types";
