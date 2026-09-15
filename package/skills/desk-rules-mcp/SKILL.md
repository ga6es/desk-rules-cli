---
name: desk-rules-mcp
description: Operate Desk Rules MCP for authorization, the Design Rule, Board research, editable design creation and editing, export, and publication preparation.
---

# Desk Rules MCP

Use the hosted endpoint `https://agents.deskrules.com/api/mcp`.

## Authority

- Treat live tool schemas and `inspect_mcp_authorization_status` as authoritative.
- Run one fresh authorization inspection before planning writes. It satisfies
  the initial billing and capability gate unless account state changes.
- Stop on unavailable billing, capability, provider, or publication
  gates and follow the bounded recovery returned by the server.
- Keep requests self-contained. Desk Rules MCP does not rely on hidden session
  state between calls.
- Host-generated callable aliases and separately configured MCP namespaces are
  client-owned. Use the canonical operation names returned by Desk Rules.

## Research

1. Resolve a `storyIdentity` such as `reddit:fullname:t3_...`,
   `rss:source-entry:<sourceId>:<entryId>`, or a story URL by passing it as the
   `query` to `inspect_news_board_story_targets`, then use its deterministic
   inspection target with `inspect_news_board_story`.
2. For multiple story identities, resolve them independently in request order.
   Skip repeated identities, report each missing identity without blocking valid
   ones, and avoid duplicate research when targets share a `storyIdentity`.
3. If resolution reports `story_identity_collision`, stop and report the
   collision rather than selecting either story.
4. Inspect current research with `inspect_news_board_story_research`.
5. Use the connected agent's own skills and permitted public research tools to
   prepare one complete current package for Facts, Angles, and
   Caveats responsibilities. Facts owns inline citations and original-source
   attribution. Keep useful secondary reporting as Facts evidence, but trace
   the graphic Source to the underlying original when possible. When that
   directly inspected original explicitly credits joint reporting, include
   every confirmed reporting partner in the single Source attribution label.
   Do not infer partners or include aggregators. Angles contains exactly three
   plain-language social graphic packages ordered from strongest to weakest,
   and the one Facts-established Source when available. Rank them by hook
   strength, visual potential, audience interest, and conversation potential
   without weakening factual or sourcing safeguards. Caveats contains at most four
   concise publishing guardrails. Keep each to 35 words, two sentences, and
   280 characters; name the risky claim or framing and the action needed before
   publication. Do not repeat Facts or invent warnings; use an empty list when
   no material publishing risk remains.
6. Fill `packageSkeleton`; validate it; then pass top-level `expectedUpdatedAt`,
   `packageFingerprint`, and `freshnessToken` to the save tool. Fresh
   stories use null revisions. On stale context, re-inspect and rebuild.
   Partial-section tools are retired and absent from discovery.
7. Treat a successful save response, including `status: "unchanged"`, as
   sufficient preservation confirmation. Inspect again only when subsequent
   work needs package content.

Research Desk tabs display the fixed responsibilities. They do not create
independent write operations:

- Facts for verified briefing.
- Angles for editorial approaches.
- Caveats for publishing guardrails.

Optional `mediaLeads` belongs beside `package`, never in `researchResult`.
Omitted or empty leads preserve the retained Media library. Supply up to twenty
ordered image/video leads to add up to ten surviving private previews, deduplicated
across searches. The library shows images before videos, newest additions first
within each type, in pages of thirty. Desk Rules processes leads
without a model call and returns sanitized nonfatal warnings if Media fails after
text is saved. Media stays outside text fingerprints and automatic template filling.
Users may explicitly attach retained images as Studio references.
Supplied leads have no discovery charge. Find media is a separate five-credit
action for every completed search, including empty or duplicate-only results;
saving Research never starts discovery automatically.
Uploaded design assets, generation, and editing remain separate operations.
- Do not send retired `images`, `imageCandidates`, `imageFill`,
  `imageCandidateId`, or `mediaCandidateId` fields. The server returns
  `research_images_retired`; use uploaded images, Studio generation, or editor
  image tools as separate operations.
- Designs for finished Generated Designs and workspace/design creation, with
  templates as starting points, not a persisted suggestions section.

Use the connected agent's permitted web, search, or browser tools for public
research. Never fabricate inaccessible evidence or send private Desk Rules
context to external services.

For saves, use exactly one complete package plus the inspected freshness fields.
Do not send retired rule state, partial sections, or nested `writeContext` objects.

## Designs

- Create a new editable Generated Design from saved research only through
  `create_design_from_story_research` after inspecting candidates and the
  selected template's fields and validating fills with
  `prepare_template_autofill`.
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
