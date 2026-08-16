# Design Draft And Preview

Use this playbook when a user asks the agent to inspect or edit an existing Desk
Rules design.

## Inspect First

1. Run `prepare_editor_action_context` for the target design.
2. Inspect the relevant page with `inspect_design_page` or
   `inspect_design_document`.
3. Use targeted inspection tools, such as `find_text_on_page`,
   `inspect_design_assets`, `inspect_uploaded_assets`, `inspect_brand_kit`, or
   `inspect_text_presets`.

## Draft Before Commit

1. Ask for approval before starting write-capable draft work if the requested
   change is not already clear.
2. Run `start_agent_draft`.
3. Run `apply_actions_to_draft` with typed actions only.
4. Use the returned draft state to run `preview_agent_draft_page`, then explain
   the proposed change.
5. Commit with `commit_agent_draft` only after explicit user approval.
6. Discard with `discard_agent_draft` if the user rejects the change.

## Guardrails

- Do not mutate the live design outside the Agent Draft commit step.
- In the full profile, use `inspect_agent_draft` only to resume or recover a
  draft when the latest apply or preview response is unavailable.
- Preserve `expectedUpdatedAt`; re-inspect when stale.
- Keep outputs bounded and user-facing.
