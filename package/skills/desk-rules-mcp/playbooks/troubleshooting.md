# Troubleshooting

1. Run `inspect_mcp_authorization_status` and inspect only the relevant Rules.
2. Follow the returned blocker and recovery path; do not bypass account,
   billing, provider, Rules, or publication gates.
3. For stale writes, reinspect and copy the refreshed `writeContext` directly
   into the next request's top level, then add the requested section fields.
4. For setup or bundle problems, use the Desk Rules plugin or the currently
   published CLI doctor from the release notes.
5. For Codex configuration, preview `deskrules mcp repair codex` and apply only
   after reviewing the bounded plan. The starter profile is the default; full
   discovery requires explicit `--profile full`.
6. Install the Desk Rules plugin or configure the hosted MCP server manually.
   These are alternative setup methods, not additive requirements.

If a removed operation returns unknown-tool, update the CLI/plugin/skill bundle
and reconnect so the client rediscovers the current manifest. Desk Rules cannot
rename host-generated callable aliases or remove separately configured client
namespaces.

Never ask for tokens, client secrets, full config files, or raw backups.
