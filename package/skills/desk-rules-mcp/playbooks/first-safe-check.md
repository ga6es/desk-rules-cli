# First Safe Check

Use this read-only check after connection or when the user asks what Desk Rules
can do.

1. Run `inspect_mcp_authorization_status`.
2. Report effective availability for the requested workflow. Distinguish an
   enabled preference from an available capability.
3. Run `inspect_rules` only for the relevant stage.
4. If workspace proof is requested, list recent designs and inspect the chosen
   design with the smallest relevant inspection tool.

Stop on a returned billing or capability blocker. Do not edit, export, publish,
or ask for secrets during this check.
