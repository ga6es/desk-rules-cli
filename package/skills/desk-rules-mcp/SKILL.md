---
name: desk-rules-mcp
description: Operate Desk Rules MCP for authorization, Rules, News Board research, editable design creation and editing, export, and publication preparation.
---

# Desk Rules MCP

Use the hosted endpoint `https://agents.deskrules.com/api/mcp`.

## Authority

- Treat live tool schemas, `inspect_mcp_authorization_status`, and the
  applicable `inspect_rules` result as authoritative.
- Run one fresh authorization inspection before planning writes. It satisfies
  the initial billing and capability gate unless account state changes.
- Stop on unavailable billing, capability, Rules, provider, or publication
  gates and follow the bounded recovery returned by the server.
- Keep requests self-contained. Desk Rules MCP does not rely on hidden session
  state between calls.
- Host-generated callable aliases and separately configured MCP namespaces are
  client-owned. Use the canonical operation names returned by Desk Rules.

## Research

1. Resolve a copied `story_XXXXXXXXXX` ID by passing it unchanged as the
   `query` to `inspect_news_board_story_targets`, then use its deterministic
   inspection target with `inspect_news_board_story`.
2. For multiple copied IDs, resolve them independently in request order. Skip
   repeated IDs, report each missing ID without blocking valid IDs, and avoid
   duplicate research when targets share a `storyFingerprint`.
3. If resolution reports `story_fingerprint_collision`, stop and report the
   collision rather than selecting either story.
4. Inspect current research with `inspect_news_board_story_research`.
5. For one section, request the compact view. Copy the fields from its
   `writeContext` into the top level of
   `validate_news_board_story_research_section`; do not send a nested
   `writeContext` object.
6. Copy the same top-level write fields and the returned `validatedSection`
   into `save_news_board_story_research_section`. This supports first-section
   creation and never fabricates other sections.
7. Treat a successful save response, including `status: "unchanged"`, as
   sufficient preservation confirmation. Inspect again only when subsequent
   work needs package content.

Use the connected agent's permitted web, search, or browser tools for public
research. Never fabricate inaccessible evidence or send private Desk Rules
context to external services. For Reddit comments, follow the returned
`researchCommentContract`, use direct comment permalinks, and preserve
`scoreStatus` exactly.

For full-package saves, use the inspected story target, package concurrency
fields, current Rules fingerprint, research result, and any permitted quality
evidence as top-level request fields.

## Designs

- Create a new editable design from saved research only through
  `create_design_from_story_research` after inspecting candidates and the
  selected template's fields and validating fills with
  `prepare_template_autofill`.
- Use canonical `mediaCandidateId` for saved image candidates.
- Read creation results from `creationSummary` and use its exact preview
  operation for visual QA.
- Edit an existing design through Agent Draft: prepare context, start a draft,
  apply typed actions, inspect and preview, then commit only after the required
  approval.
- Direct editor commands remain appropriate for an explicitly requested
  one-step edit when their own schema and authorization permit it.

## Signals And Feeds

- Treat `Cooling`, `Fast climb`, `Conversation spike`, `Early traction`, and
  `High engagement` as deterministic prioritization hints, never sentiment,
  consensus, verification, or universal scores.
- Hot, New, and Rising are factual Reddit lanes, not signal notes.
- Copy canonical source and list configs from inspection; do not invent source
  metadata, owner IDs, or board IDs.

## Approval Boundaries

- A user's request and current authorization are both required for writes.
- Export only when requested and available.
- Publish only after explicit approval for the exact publication in the current
  conversation.
- Keep output bounded and never expose raw records, documents, credentials,
  provider payloads, storage paths, or billing details.

## Playbooks

- [first-safe-check.md](playbooks/first-safe-check.md)
- [story-to-design.md](playbooks/story-to-design.md)
- [design-draft-preview.md](playbooks/design-draft-preview.md)
- [export-and-publish.md](playbooks/export-and-publish.md)
- [troubleshooting.md](playbooks/troubleshooting.md)
