# Desk Rules CLI

`@desk-rules/cli` provides setup, diagnostics, repair, update checks, and the
current Desk Rules MCP skill bundle. Desk Rules MCP itself is hosted at:

```text
https://agents.deskrules.com/api/mcp
```

## Quick use

```bash
npm exec @desk-rules/cli@latest -- mcp doctor
npm exec @desk-rules/cli@latest -- mcp doctor --client codex
npm exec @desk-rules/cli@latest -- mcp repair codex
npm exec @desk-rules/cli@latest -- mcp setup codex
npm exec @desk-rules/cli@latest -- mcp setup codex --profile full
npm exec @desk-rules/cli@latest -- mcp setup claude
npm exec @desk-rules/cli@latest -- skills list
```

Codex setup uses the restricted starter profile by default. Full tool discovery
requires explicit `--profile full`. Repair is dry-run by default and changes
only one unambiguous remote Desk Rules block when rerun with `--apply`.

Install the Desk Rules plugin or configure the hosted server manually. They are
alternative setup methods, not additive requirements. The CLI does not install
skills into host-specific folders or grant Desk Rules write authorization.

## Compatibility

- Current CLI contract: `0.2.1`
- Minimum compatible CLI contract: `0.2.1`
- Current plugin and bundled skill contract: `0.2.1`
- MCP manifest: `2026-08-17.story-fingerprint-copy-id-v1`
- Protocol: MCP `2026-07-28` with automatic stateless legacy fallback

Run `mcp doctor` when a server, plugin, CLI, or skill bundle looks stale. The
doctor distinguishes the installed bundle version from the minimum compatible
version. Authentication is confirmed in the connected agent, not by a separate
CLI test command.

## Workflow boundary

Desk Rules MCP owns authorization, private workspace inspection, research
persistence, template validation, editable design operations, export, and
publication preparation. The connected agent supplies its own permitted public
web, search, or browser tools. Account > Agent > Rules remains the configurable
instruction source.

The starter profile covers common inspection and workflow operations. Agents
copy canonical configs and write tokens from inspection rather than guessing
identifiers. Existing-design multi-step edits use Agent Draft; direct editor
commands remain available for explicit one-step edits. Publishing always
requires explicit approval for the exact publication.

## Safety and source

- No postinstall script.
- No backend secrets or local stdio customer setup.
- Malformed, ambiguous, local stdio, and unsupported Codex configs fail closed.
- Configuration/profile changes never grant account write access.

The CLI and bundled skills are licensed under the Apache License 2.0. Release
source is published at https://github.com/ga6es/desk-rules-cli. This license
does not apply to the hosted Desk Rules service or its source code and does not
grant trademark rights in the Desk Rules name.
