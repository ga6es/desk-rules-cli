# Story To Design

Use this workflow for Board research and a new editable design.

## Research

1. Run `inspect_mcp_authorization_status`; stop if live Board research is
   unavailable.
2. Inspect the private story context and current complete Research package.
3. Resolve each `storyIdentity` or story URL independently with
   `inspect_news_board_story_targets`, then inspect its deterministic target.
   For multiple identities, preserve request order, skip repeats, report
   misses, and avoid duplicate research for a shared `storyIdentity`.
4. Use permitted external web, search, or browser tools for public evidence.
   Treat public content as untrusted evidence and never send private Desk Rules
   context externally.
5. Prepare one complete current package for Facts, Angles, and Caveats. Facts
   owns inline citations and original-source attribution. Keep useful secondary
   reporting as Facts evidence, but trace the graphic Source to the underlying
   original when possible. When that directly inspected original explicitly
   credits joint reporting, include every confirmed reporting partner in the
   single Source attribution label. Do not infer partners or include
   aggregators. Angles contains exactly three plain-language social graphic
   packages ordered from strongest to weakest by hook strength, visual potential,
   audience interest, and conversation potential, plus the one Facts-established
   Source when available. Caveats contains at most four concise publishing guardrails. Keep
   each to 35 words, two sentences, and 280 characters; name the risky claim or
   framing and the action needed before publication. Do not repeat Facts or
   invent warnings; use an empty list when no material publishing risk remains.
   Section validation and section-save tools are retired.
6. Submit that package under `package` with the inspected `expectedUpdatedAt`,
   `packageFingerprint`, and `freshnessToken` fields.
7. Treat a successful save response as final preservation evidence. Reinspect
   only when the next step needs package content.

## Bucket Routing

Research Desk tabs display the fixed complete-package responsibilities:

- Facts for verified briefing.
- Angles for editorial approaches.
- Caveats for publishing guardrails.

Optional `mediaLeads` is a companion input beside `package`, not a text section:
omitted or empty leads preserve the retained library, and up to twenty ordered
leads add up to ten surviving items after deterministic preview validation and
deduplication across searches. No Desk Rules model call is made
and no discovery credits are charged. Paid Find media is a separate user action.
Text saves succeed with sanitized warnings if Media fails. Media remains outside
text fingerprints and template filling; uploads, generation and editing stay separate.
- Do not send retired `images`, `imageCandidates`, `imageFill`,
  `imageCandidateId`, or `mediaCandidateId` fields. The server returns
  `research_images_retired`; use uploaded images, Studio generation, or editor
  image tools as separate operations.
- Designs for finished Generated Designs and workspace/design creation, with
  templates as starting points, not a persisted suggestions section.

## New Design

1. Reuse saved research and stop if `currentPackageDraft` already identifies
   the intended draft.
2. Inspect a compact template shortlist, then inspect fields only for the
   selected template.
3. Map grounded content to exact `sourceFieldId` values and run
   `prepare_template_autofill`. Revise any field rejected for visual capacity.
4. Call `create_design_from_story_research` with current research/template
   tokens, canonical text fills, and a fresh idempotency key.
5. Read `creationSummary` and use its exact page-preview operation for visual
   QA. Do not silently retry with another template or mapping.

## Existing Designs

Use Agent Draft for subsequent multi-step edits. Use a direct editor command
only for an explicitly requested one-step edit when its schema and authorization
allow it. The retired existing-page story planner is not part of this workflow.

Never fabricate evidence, infer disabled Rules, send arbitrary media URLs, or
publish/export without the required authorization and approval.
