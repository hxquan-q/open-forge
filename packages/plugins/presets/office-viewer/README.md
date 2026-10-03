# @vetta/plugin-office-viewer

## Context Boundary

```yaml
purpose: %plugin.description%
provides:  []
consumes:  []
internal_dependencies:
  - "@vetta-org/plugin-sdk"
  - "@vetta-org/plugin-vite"
  - "@vetta-org/ui"
```

## Preview loading and lifetime

Activating the plugin registers every supported file extension without loading document parsers.
The preview loads only the requested PDF, DOCX, PPTX, or spreadsheet implementation after mounting,
with a loading state and a local error if parser code cannot load. File changes still refresh the preview.
The browser may retain an imported module after its preview closes; this is code splitting, not module unloading.

PDF previews share a reference-counted worker source URL. The last loading task releases that URL only
after asynchronous destruction settles, including failed shutdown. No worker Blob URL is created during registration.

Run `bun run test` for host-registration, format switching, file-refresh and resource-lifetime tests.
Run `bun run build -- --manifest` to inspect the federation manifest: document parsers belong in asynchronous
assets, not in the plugin's synchronous entry graph. Bundle byte counts are not Renderer RAM measurements.
