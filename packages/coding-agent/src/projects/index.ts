export { ensureVettaLocalGitignore, loadProjectConventions } from "./load-project-conventions.js";
export {
	loadProjectToolPolicy,
	type ProjectToolPolicy,
	ProjectToolPolicySchema,
	readProjectToolPolicy,
} from "./project-tool-policy.js";
export {
	CURRENT_VETTA_PROJECT_SCHEMA_VERSION,
	conventionsFromManifest,
	gitignoreAdditionForVettaLocal,
	gitignoreCoversVettaLocal,
	legacyProjectConventions,
	readVettaProjectManifest,
	type SharedProjectConventions,
	VETTA_LOCAL_GITIGNORE_LINES,
	VETTA_LOCAL_GITIGNORE_MARKER,
	VETTA_LOCAL_PROJECT_DIRECTORY,
	VETTA_PROJECT_DIRECTORY,
	VETTA_PROJECT_MANIFEST_FILE,
	VETTA_PROJECT_SUBDIRECTORIES,
	type VettaProjectManifest,
	VettaProjectManifestError,
	type VettaProjectSubdirectory,
} from "./shared-project-conventions.js";
