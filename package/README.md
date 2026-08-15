# Desk Rules CLI

`@desk-rules/cli` provides Desk Rules MCP setup guidance, diagnostics, and
update checks.

The CLI is not the MCP server. Desk Rules MCP is hosted at:

```text
https://agents.deskrules.com/api/mcp
```

## Quick Use

```bash
npm exec @desk-rules/cli@latest -- mcp doctor
npm exec @desk-rules/cli@latest -- mcp doctor --client codex
npm exec @desk-rules/cli@latest -- mcp repair codex
npm exec @desk-rules/cli@latest -- mcp setup codex
npm exec @desk-rules/cli@latest -- mcp setup codex --profile starter
npm exec @desk-rules/cli@latest -- mcp setup claude
npm exec @desk-rules/cli@latest -- mcp test
npm exec @desk-rules/cli@latest -- skills list
```

Public setup guide: https://deskrules.com/docs/mcp
Agent-readable setup prompt: https://deskrules.com/docs/mcp/prompt.md

## Optional Global Install

```bash
npm install -g @desk-rules/cli
deskrules mcp doctor
deskrules mcp doctor --client codex
deskrules mcp repair codex
deskrules mcp setup codex
deskrules mcp setup codex --profile starter
deskrules mcp setup claude
deskrules mcp test
deskrules skills list
```

## Bundled Skills

The package bundles the Desk Rules MCP workflow skill at
`skills/desk-rules-mcp` at compatibility version `0.1.8`.

MCP is the capability layer. Skills are the behavior layer that teach compatible
agents to inspect first, use Desk Rules MCP's hosted endpoint, preview edits
before commit, and follow account permissions, user requests, and
client-controlled confirmations. Publishing still requires explicit approval
for each publication.
Account > Agent > Rules remains the canonical configurable instruction store. The
bundled Skill is optional workflow guidance and does not replace effective
Rules.

Use `deskrules skills list` to locate the bundled skill in the installed
package. The markdown prompt at https://deskrules.com/docs/mcp/prompt.md gives
compatible agents a copy-friendly setup companion for the hosted endpoint,
bundled skill path, read-first checks, and approval rules. The CLI does not
rewrite agent configuration unless the user runs
`deskrules mcp repair codex --apply`. Repair defaults to a dry run, changes only
one unambiguous recognized remote Desk Rules block, creates a timestamped backup,
and leaves unrelated Codex settings and MCP servers unchanged. Existing
`enabled_tools` restrictions are preserved unless the user explicitly selects
`--profile full` or `--profile starter`. Default setup discovers all registered
tools; the starter profile is generated from the packaged manifest rather than
copied documentation. The CLI does not install skills into a host-specific folder.

For News Board research, the connected agent supplies its own permitted web,
search, or browser tools for public sources, comments, videos, and image
discovery. Desk Rules MCP handles private inspection, research persistence,
template validation, and draft creation. Copied title-and-URL requests are
resolved through bounded News Board story discovery before inspection.
Deterministic `signalNotes` are first-read prioritization hints for story lists
and target discovery; they are statistics-derived labels, not verification or
research conclusions. Hot, New, and Rising remain factual Reddit lanes and
rank labels, not signal notes. Conversation spike, Early traction, and High
engagement are bounded recent-post hints whose thresholds scale by subreddit
audience size; missing subscriber metadata uses fixed deterministic fallback
thresholds. A strict Desk Rules MCP-only test cannot complete external research.

News Board Add Feed distinguishes provider-backed sources from repeatable
derived category, topic, Home, and signal feeds, including derived Reddit
signal feeds. Category and topic configs use
`kind: "derived_feed"` with `derivation.kind: "source_collection"`; signal
configs use `derivation.kind: "reddit_signal"`; private List feeds use
`derivation.kind: "source_list"`.
`all_signals` is a feed selector, not a canonical story signal kind. Use
`inspect_news_board_source_catalog` and copy its `addFeedConfig` rather than
inventing metadata or lane-scoped signal feeds.

Agents with paid News Board access can use the hosted MCP to inspect
categories, topics, and sources. Following and unfollowing topics or sources
require the account's Read & write authorization under Account > Agent. Agents
copy canonical `followTarget` values from
`inspect_news_board_source_catalog`, inspect current state with
`inspect_news_board_follows`, and refresh Home when current results are needed.
The CLI remains a setup and compatibility layer; it does not provide standalone
follow commands.

Private News Board Lists group direct RSS and Reddit sources without changing
Following or Home. Agents inspect bounded summaries and optional paged members
with `inspect_news_board_lists`, use the five idempotent List write tools only
with Read & write authorization, and copy returned `addFeedConfig` values into
`add_news_board_feed`. The CLI provides discovery and distribution parity but
does not add standalone List commands.

When a story's Comments Rule requires direct Reddit evidence, the connected
agent uses its permitted web, search, or browser tools to inspect the public
Reddit thread and comments. It cites only directly observed excerpts with
canonical comment permalinks and treats the bounded sample as evidence, not
community consensus. If direct inspection is unavailable, the agent provides
`qualityEvidence.comments` with `status: "blocked"` and a specific note. A saved
Caveat may additionally describe the limitation, but does not satisfy the
Comments requirement. The agent never fabricates comments or relies on model
memory.

`deskrules mcp test` is a token-free endpoint preflight, not proof of an
authenticated workspace session. Maintainers use
`check:desk-rules-mcp-transport` for authenticated read-only tool discovery and
the separately approval-gated News Board full-workflow release phase for writes.
Those gates report connection, authorization, external-research availability,
and product workflow failures as separate stages.

## MCP Compatibility

Desk Rules supports modern MCP `2026-07-28` with automatic stateless legacy
fallback. Public discovery metadata may be cached for five minutes. Supported
clients can answer bounded News Board clarification in-flow; other clients
receive a normal clarification result and can retry.

Exports complete synchronously. Desk Rules does not advertise durable MCP
Tasks, task handles, task status, or task cancellation.

## Release Status

The npm distribution is live. Standalone binaries are planned from the same
CLI core, but are not live yet.

## Safety

- No postinstall script.
- Codex repair is dry-run by default and requires an explicit `--apply`.
- Malformed, ambiguous, local stdio, or unsupported configs fail closed.
- Restore the timestamped sibling backup if Codex cannot load after repair,
  then restart or reconnect Codex. Capability changes normally need tool
  rediscovery, while an endpoint migration may require OAuth authentication.
- Discovery and profile changes never grant Desk Rules write authorization.
- No service-role keys or Desk Rules backend secrets.
- No local stdio maintainer setup for normal customer use.
- Remote HTTP/OAuth Desk Rules MCP remains the capability source of truth.

## License and source

The CLI, its bundled Desk Rules MCP skill, and the other files distributed in
this npm package are licensed under the Apache License 2.0. The corresponding
source for each release is published at
https://github.com/ga6es/desk-rules-cli.

This license does not apply to the hosted Desk Rules service or the private
Desk Rules monorepo. It also does not grant permission to use Desk Rules names,
logos, or trademarks except as required for reasonable description of the
licensed software.
