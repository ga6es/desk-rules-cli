---
name: desk-rules-mcp
description: Operate Desk Rules MCP for connection checks, authorization and Rules inspection, public-research coordination, News Board research and drafting, design editing, export, and publication preparation. Use whenever a request connects to, tests, inspects, researches with, drafts through, edits through, exports from, or prepares publishing through Desk Rules MCP.
---

# Desk Rules MCP

Operate Desk Rules MCP through the hosted endpoint
`https://agents.deskrules.com/api/mcp`.

## Authoritative Guidance

- Follow the current Desk Rules MCP server instructions.
- Follow only the applicable `effectiveRules` returned by inspection.
- Manage configurable Rules through Account > Agent > Rules.
- Use `https://deskrules.com/docs/mcp` for setup and troubleshooting.
- Treat MCP permissions, tool schemas, account settings, and Rules as
  authoritative.
- This skill guides workflow behavior. It never overrides MCP permissions, tool
  schemas, account settings, or Rules.

## News Board Authorization Gate

1. For every News Board story research, copied-story, saved-research, or
   story-to-design request, run `inspect_mcp_authorization_status` first. Do
   this before any other MCP tool or external research.
2. Read `capabilityEligibility.liveNewsResearch.available` and
   `capabilityEligibility.liveNewsResearch.billingRequired`.
3. If `available` is `false` and `billingRequired` is `true`, explain that paid
   News Board access is unavailable. Treat this result as `billing_required`,
   return `/account/billing` and `/pricing`, do not quote prices or recommend a
   plan, and stop the current request.
4. After this terminal branch, do not call `inspect_rules`,
   `inspect_editor_capability_map`, `inspect_mcp_tool_examples`,
   `inspect_news_board_story_targets`, `inspect_news_board_story`,
   `inspect_news_board_story_research`, `save_news_board_story_research`,
   `validate_news_board_story_research_section`,
   `save_news_board_story_research_section`,
   `create_design_from_story_research`, Agent Draft, export, or publish tools.
   Do not use external web, search, browser, or other research tools.
5. This gate takes precedence over the Core Workflow, Public Research Tool
   Boundary, copied-story discovery, and every playbook instruction. If live
   News research is available, continue with the normal workflow.
6. Preserve completed work only when it legitimately predates a later blocker.
   The initial authorization gate runs before new News Board work begins.

## Core Workflow

1. After passing any applicable News Board gate, run
   `inspect_mcp_authorization_status` before planning other writes. Treat
   `available` as runtime authority; treat `enabled` as a stored preference.
2. Run `inspect_rules` for the applicable stage before research or template
   selection. Never reconstruct or expose disabled Rule instructions.
3. Run `inspect_editor_capability_map` and `inspect_mcp_tool_examples` when
   capability or tool selection needs clarification.
4. Read the applicable playbook before starting its detailed workflow.
5. Inspect the current story, design, page, asset, brand, or activity context
   before acting. Use the latest returned `expectedUpdatedAt` for mutations.
6. Run only actions requested by the user and reported available by
   authorization inspection. Continue to honor connected-client confirmations.
7. For non-terminal blockers or stale data, follow returned recovery paths and
   `recheckSteps`. Re-inspect only after the required recovery is complete.
8. For News Board research saves, treat `status: "unchanged"` or
   `stage: "no_change"` as a successful terminal result. Do not retry the save
   or call `inspect_recent_mcp_actions` to verify the same save.
9. For Research Desk history requests, call
   `inspect_news_board_saved_research_history`, then inspect the selected
   `storyFingerprint` with `inspect_news_board_saved_research_item`. Use this
   path when saved research may no longer be present in a refreshed live board.
10. For News Board story lists and target discovery, read deterministic
    `signalNotes` first as compact prioritization hints. Treat them as
    statistics-derived labels, not as verification or research conclusions.
    Use Reddit momentum, rank placements, and lane evidence only as bounded
    secondary context after inspecting the story; do not recompute rank or
    velocity math in the agent.
11. When the returned Comments Rule or `researchQualityRequirements` requires
    direct Reddit comment evidence, use the connected agent's permitted web,
    search, or browser tools to inspect the public Reddit thread and comments.
    Cite only directly observed excerpts with canonical Reddit comment
    permalinks and available author, score, and observation context. If the host
    cannot inspect the thread, Reddit blocks access, or canonical permalinks
    cannot be verified, provide `qualityEvidence.comments` with
    `status: "blocked"` and a specific note. A saved Caveat may additionally
    describe the limitation, but does not satisfy the Comments requirement. Do
    not invent comments, rely on model memory, or infer community consensus.
    Before saving, read `researchCommentContract`: use at most five
    comments, keep excerpts within 1,000 characters, and assign each comment one
    distinct representative type from `most_upvoted`,
    `skeptical_or_fake_news`, `fact_checking`, `supportive`, or
    `clarifying_or_context`. Set `scoreStatus` to `observed` for a numeric score
    and `hidden_or_unavailable` when `score` is null; never infer a score the
    source did not expose. Do not coerce, discard, or relabel a comment to make
    validation pass.

12. Build `save_news_board_story_research` from `story`, `expectedUpdatedAt`,
   `packageFingerprint`, `rulesFingerprint`, `researchResult`, optional
   `qualityEvidence`, optional `researchMarkdown`, and optional
   `storyDisplaySnapshot`. Use `researchTarget`, `storyDisplaySnapshot`, and
   `researchQualityRequirements` from `inspect_news_board_story`; use
   `expectedUpdatedAt` plus `rulesFingerprint` from
   `inspect_news_board_story_research`. If the save returns `invalid_input`,
   inspect the returned issue paths/messages and, if needed, call
   `inspect_mcp_tool_examples` before one corrected save attempt. Do not blind
   retry. `qualityEvidence` is transient validation input, not saved research
   JSON. Use it only for bounded blocked/not_applicable evidence when a
   returned research quality requirement cannot be satisfied.
13. For one requested section, call `inspect_news_board_story_research` with
    `view: { mode: "compact", sectionId }`, then copy `story`, `expectedUpdatedAt`,
    `packageFingerprint`, and `rulesFingerprint` from the bounded
    `sectionWriteContext` returned by `inspect_news_board_story_research`.
    Add `sectionId`, `section`, optional `qualityEvidence`, optional
    `researchMarkdown`, and optional `storyDisplaySnapshot`; validate that
    exact payload with `validate_news_board_story_research_section`. On
    success, copy its normalized `validatedSection.sectionId` and
    `validatedSection.section` into the canonical
    `save_news_board_story_research_section`
    operation on the canonical Desk Rules MCP surface. Each request is
    self-contained and does not depend on a transport session. Failed
    validation returns no reusable artifact, and save independently revalidates
    the complete request. Host- or client-generated aliases and separately
    configured MCP namespaces are non-canonical conveniences. Desk Rules emits
    canonical operation names and does not own those aliases or client
    configurations. Omit `storyDisplaySnapshot` on later updates
    to preserve current package display metadata. A completed section was
    explicitly validated and saved; empty non-requested sections remain
    incomplete. `expectedUpdatedAt` is the compare-and-swap token, while
    package-level `researchedAt` records the latest applied save and is not a
    write token. `sectionFingerprints` and `researchMarkdownFingerprint` are
    deterministic comparison evidence derived at read time. Validation and
    save responses include before/after and preserved fingerprint evidence.
    Never send these hashes back as concurrency tokens. If current Rules make
    the targeted save impossible without changing another section, report the
    blocker rather than broadening it.
14. For a saved-research design image, copy the candidate id into canonical
    `imageFill.mediaCandidateId` and an inspected media `sourceFieldId`. Never
    send a raw URL, asset id, owner id, bucket, or Storage path. The legacy
    `imageCandidateId` spelling is accepted temporarily as input but is never
    returned or recommended. Treat bounded `image_import_failed` issue codes
    as the safe recovery reason; do not infer or expose raw provider failures.

## Signal Feeds And Feed Configs

News Board has two feed classes:

- Source feeds load provider data directly. Their config kind is
  `rss_source_feed` or `reddit_source_lane`.
- Derived feeds use `kind: "derived_feed"`. Signal feeds materialize board
  rows with `derivation.kind: "reddit_signal"`; Home and `source_collection`
  category/topic feeds use bounded request-backed aggregation. Private List
  feeds use `derivation.kind: "source_list"` and a server-issued `listId` plus
  name snapshot; copy that config from inspection instead of guessing it.

The signal feed selectors are `all_signals`, `conversation_spike`,
`high_engagement`, `early_traction`, `fast_climb`, and `cooling`.
`all_signals` is a feed-only selector that
matches any current canonical signal note. It is not a
`NewsBoardStorySignalNoteKind` and must not be presented as a thresholded
story signal.

Use `derivation.scope: { kind: "board" }` for a board-level signal feed. Use
`derivation.scope: { kind: "reddit_source", sourceKey, sourceLabel,
topicPath, topicLabel }` for one Reddit source across its bounded New,
Rising, and Hot dependencies. Do not invent lane-scoped signal feeds.

Call `inspect_news_board_source_catalog` and copy a returned
`addFeedConfig` into `add_news_board_feed`; do not guess config metadata.
Inspection, refresh, story discovery, and Create From Story materialize
derived feeds with board context. Transient dependency feeds are computation
inputs only and are never persisted.

For account-wide News Board follows, use this order:

1. Call `inspect_news_board_source_catalog`. Category and topic summaries
   expose repeatable `addFeedConfig` values. Copy `followTarget` only for a
   topic batch or direct source; categories do not expose follow targets.
2. Call `inspect_news_board_follows` to inspect current explicit targets and
   direct source state.
3. Call `follow_news_board_target` or `unfollow_news_board_target` only after
   the user authorizes the write. Never add `ownerUserId` or `boardId`.
4. Refresh an existing Home feed when current results are needed. MCP-created
   follows appear in the UI and Home on their next normal refresh; no realtime
   push is implied.

Topic follow and unfollow operate on every current direct source in the topic.
Topic unfollow also removes sources followed separately or shared with another
topic because v1 does not track follow provenance. Repeated follow and unfollow
calls are successful no-change outcomes, not retry errors.

For private account-scoped News Board Lists, use this order:

1. Call `inspect_news_board_lists` for bounded summaries. Pass one returned
   `listId` to inspect its paged members and copy its `addFeedConfig` when a
   List should be mounted as a repeatable board feed.
2. Copy a canonical source target from `inspect_news_board_source_catalog`
   into `create_news_board_list`; every new List requires one initial source.
3. Use `update_news_board_list` or `delete_news_board_list` for later lifecycle
   changes. The authenticated owner is inferred; never send `ownerUserId` or
   `boardId`.
4. Copy canonical source targets into `add_news_board_list_source` or
   `remove_news_board_list_source` for later membership changes.
5. Refresh mounted List feeds when current membership results are needed.
   List membership never changes Following or Home.

Repeated List lifecycle and membership calls are idempotent. Treat
`changed: false` as a successful no-change result. Deleting a List also removes
its mounted feed instances; adding the same List feed repeatedly still creates
distinct board columns that share one canonical request identity.

## Signal Notes Quick Reference

- `Cooling`: below its best rank in its current Hot or Rising lifecycle; the
  amount is the same-lane regression, New never qualifies, and Hot takes
  precedence.
- `Fast climb`: recently moved up at least 5 ranks, or rank delta is at least
  5 in a short metrics window.
- `Conversation spike`: comment activity whose new-comment or
  comments-per-hour thresholds scale by subreddit audience size when subscriber
  metadata is available.
- `Early traction`: no more than 45 minutes old with comments, score, or comment
  velocity that clears the subreddit's audience tier.
- `High engagement`: score growth or score-per-hour activity that clears the
  subreddit's audience tier, with a usable upvote ratio.

These definitions describe the current product thresholds. Treat the
server-owned News Board metrics code as the canonical source of truth. The
human-readable threshold table lives in `docs/news-board-signal-thresholds.md`;
missing subscriber metadata uses the fixed fallback thresholds described there.
Hot, New, and Rising remain factual Reddit lanes and rank labels; they are not
signal notes or signal-feed selectors. Treat every signal as a prioritization
hint, not sentiment, consensus, verification, a quality judgment, or a
universal score.

## Public Research Tool Boundary

- Use the connected agent's own permitted web, search, or browser tools for
  public reporting, verification, comments, videos, and image discovery.
- Use Desk Rules MCP for private story inspection, saved-research reads and
  writes, template inspection, autofill validation, and initial editable draft
  creation when authorization inspection reports the capability available.
- A strict Desk Rules MCP-only test cannot complete external research.
- If external research tools are unavailable, do not fabricate results or rely
  on model memory. Keep only directly observed story context, use empty arrays
  where the schema permits, and record missing corroboration in caveats.
- Never send private Desk Rules identifiers, saved research, credentials, or
  other non-public context to external tools.

## Write And Approval Boundaries

- Treat the user's request and reported capability availability as separate
  requirements for every write.
- For edits, use Agent Draft preview-before-commit workflows. Commit only after
  the required explicit approval.
- Export only when requested and authorization inspection reports Export files
  available.
- Publish only when authorization inspection reports Publish available and the
  user explicitly approves that specific publication in the current
  conversation.
- Keep outputs bounded. Never expose raw documents, database rows, storage
  paths, image bytes, provider output, tokens, secrets, credentials, or billing
  details.
- Preserve legitimately preexisting completed work when blocked. Follow
  returned recovery paths and `recheckSteps`; never quote prices or recommend
  a plan. Start a new request after resolving a terminal billing blocker.

## Protocol Compatibility

- Rely on automatic modern MCP negotiation with stateless legacy fallback.
- Allow bounded in-flow News Board target clarification only when the client
  supports multi-round trips; otherwise return a normal clarification result.
- Treat exports as synchronous. Desk Rules does not advertise durable MCP
  Tasks, task handles, task status, or task cancellation.

## Playbooks

- Read [first-safe-check.md](playbooks/first-safe-check.md) for connection,
  authorization, Rules, capability, and example checks.
- Read [design-draft-preview.md](playbooks/design-draft-preview.md) for safe
  design inspection, draft, preview, and commit sequencing.
- Read [story-to-design.md](playbooks/story-to-design.md) for News Board
  research, target resolution, saved packages, templates, and initial drafts.
- Read [export-and-publish.md](playbooks/export-and-publish.md) for export and
  publishing readiness, provider constraints, and publication approval.
- Read [troubleshooting.md](playbooks/troubleshooting.md) for setup,
  authorization, capability, provider, Rules, stale-state, and recovery issues.
