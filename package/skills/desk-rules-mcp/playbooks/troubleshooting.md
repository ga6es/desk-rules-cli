# Troubleshooting

Use this playbook when Desk Rules MCP setup, permissions, or tool behavior is
unclear.

## Checks

1. Run `inspect_mcp_authorization_status`.
2. Distinguish `enabled`, the stored account preference, from `available`, the
   effective result after master write access, billing, provider readiness,
   tool registration, and the workflow setting are evaluated.
3. Run `inspect_editor_capability_map`.
4. Run `inspect_mcp_tool_examples` for the affected workflow.
5. If a write is blocked, explain whether the issue is the user's Read only /
   Read & write choice, a disabled workflow permission, agent approval
   settings, billing eligibility, provider connection, or stale design state.

## Fix Guidance

- Endpoint issues: confirm `https://agents.deskrules.com/api/mcp`.
- Auth issues: ask the user to authenticate Desk Rules MCP in their agent.
- Advanced OAuth issues: run `deskrules mcp doctor`. Desk Rules validates the
  authorization-server issuer advertised through protected-resource metadata.
  A changed or mismatched issuer requires reconnecting; do not reuse cached
  client registration. Prefer a pre-registered client or Client ID Metadata
  Document when the server reports it available, with Dynamic Client
  Registration retained only as the compatibility fallback. Never ask the user
  to paste tokens, client secrets, or registration credentials.
- Write issues: direct the user to Desk Rules Account > Agent. Read & write is
  the master gate; Save research, Create initial draft, Edit existing designs,
  Export files, and Publish store workflow preferences. A stored setting being
  enabled is not sufficient when authorization inspection reports it
  unavailable. Explain separately whether the tool itself asks before write
  actions.
- Billing issues: preserve completed work and direct the user to
  `/account/billing` or the authoritative `/pricing` page. Never quote prices,
  expose billing records, or recommend a plan. After a change, recheck
  authorization, Rules, research freshness, current-package draft state, and
  template state.
- Provider connection issues: preserve completed work, direct the user to
  `/account/apps`, and re-inspect the provider target before retrying.
- Rules issues: direct the user to Account > Agent > Rules. If a workflow reports
  `stale_rules`, inspect the applicable stage again before retrying.
- Capability issues: for `capability_disabled`, preserve completed work, name
  the disabled setting from the blocker, and direct the user to Account >
  Agent before re-inspecting authorization.
- Stale design issues: re-inspect and retry with the latest `expectedUpdatedAt`.
- Unsupported provider issues: explain the current manifest-supported path.
- Setup or version issues: ask the user to run
  `npm exec @desk-rules/cli@latest -- mcp doctor` or `deskrules update`.
- Codex config issues: run `deskrules mcp doctor --client codex`, then preview
  `deskrules mcp repair codex`. Only rerun with `--apply` after reviewing the
  bounded plan. Existing tool restrictions are preserved unless the user
  explicitly chooses `--profile full` or `--profile starter`.
- Applied Codex repairs create a timestamped sibling backup and change only one
  recognized remote Desk Rules block. Malformed, ambiguous, local stdio, and
  unsupported configs fail closed.
- Desk Rules repair never changes unrelated global Codex settings. Follow the
  exact manual guidance for blockers such as an invalid `service_tier`.
- After endpoint or capability changes, restart or reconnect the client so it
  rediscovers tools. Capability-only changes normally do not require OAuth
  again; endpoint changes may. Discovery changes never grant write access.

## Guardrails

- Do not ask for secrets or tokens.
- Do not ask the user to paste their full Codex config or backup.
- Do not suggest local stdio maintainer setup as the normal customer fix.
- Do not bypass the user's Desk Rules access choice, billing, account,
  provider, or server authorization.
