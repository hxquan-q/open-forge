<!-- Modified by The Open Forge contributors. -->
# Security Policy

## Supported versions

Security fixes for the Open Forge client land in the development line and ship with a subsequent desktop release. This repository does not maintain separate long-lived patched release lines.

## Reporting a vulnerability

Do not disclose vulnerability details in public issues, pull requests, or discussions.

Check the [repository Security page](https://github.com/hxquan-q/open-forge/security) for an enabled private reporting channel. This checkout does not document a confirmed private contact address. If no private channel is available, request one from the maintainers without including the vulnerability details. Do not send reports to another project's community or advisory tracker.

A private report should contain:

- The affected version and platform.
- The feature, component, and build mode involved.
- Reproduction steps using synthetic data.
- Expected and actual behavior, impact, and a minimal proof of concept when available.

Never attach API keys, tokens, cookies, user sessions, or production configuration.

## Scope

This repository covers the desktop app, CLI, mobile source, transport services, Agent runtime, extension loading, and documentation site. Client permission enforcement, credential storage, and network behavior are part of that scope.

The business backend is maintained separately. Model providers, MCP servers, and independently installed plugins have their own maintainers; report a client defect here when Open Forge fails to enforce its contract or distributes the affected code.

Read [data and build modes](README.md#data-and-build-modes) and the [security and data reference](apps/docs-site/content/docs/en/reference/security-and-data.mdx) for the current client boundaries.
