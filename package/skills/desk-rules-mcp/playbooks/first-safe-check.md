# First Safe Check

Use this playbook when a user has just connected Desk Rules MCP or wants proof
that the connection works.

## Steps

1. Run `inspect_mcp_authorization_status`.
2. Report billing eligibility, live News Board availability, master Read &
   write access, and effective workflow availability. Treat `enabled` as the
   stored preference and `available` as the current effective result.
3. Run `inspect_rules` and summarize enabled stages without exposing disabled
   instructions.
4. Run `inspect_editor_capability_map`.
5. Run `inspect_mcp_tool_examples`.
6. If the user wants workspace proof, run `list_recent_designs`.
7. Ask the user which design to inspect, then run `inspect_design_metadata` and
   `inspect_design_pages`.

## Expected Outcome

The user should know whether the agent is authenticated, whether paid News Board
access is available, whether master write access is available, which workflow
capabilities are effectively available, and what safe next action is possible.

## Guardrails

- Keep this flow read-only.
- Do not edit, export, publish, duplicate, or resize anything.
- When a capability is unavailable, explain the next safe recovery action
  returned by authorization inspection and do not attempt the blocked tool.
