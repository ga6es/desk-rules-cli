import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { test } from "node:test"

// The package source is supplied by the reviewed export, not duplicated in the
// canonical public-repository template kept in the private monorepo.
const oauthModuleUrl = new URL("../package/src/oauth-metadata.js", import.meta.url).href
const repairModuleUrl = new URL("../package/src/codex-config-repair.js", import.meta.url).href
const manifestModuleUrl = new URL("../package/dist/manifest.js", import.meta.url).href
const loadSourceModules = async () => {
  const [oauthModule, repairModule] = await Promise.all([
    import(oauthModuleUrl),
    import(repairModuleUrl),
  ])
  return {
    createAuthorizationServerMetadataUrl:
      oauthModule.createAuthorizationServerMetadataUrl,
    inspectAuthorizationServerMetadata:
      oauthModule.inspectAuthorizationServerMetadata,
    planCodexConfigRepair: repairModule.planCodexConfigRepair,
  }
}

const canonicalEndpoint = "https://agents.deskrules.com/api/mcp"
const cliVersion = JSON.parse(
  readFileSync(new URL("../package/package.json", import.meta.url), "utf8"),
).version as string

test("Codex repair fails closed and recognizes the canonical starter profile", async () => {
  const { planCodexConfigRepair } = await loadSourceModules()
  const manifestModule = await import(manifestModuleUrl)
  assert.equal(
    planCodexConfigRepair(
      '[mcp_servers.desk-rules-mcp]\nurl = "unterminated\n',
    ).status,
    "blocked",
  )
  const plan = planCodexConfigRepair(
    [
      "[mcp_servers.desk-rules-mcp]",
      `url = "${canonicalEndpoint}"`,
      `enabled_tools = ${JSON.stringify(manifestModule.DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES)}`,
      "",
    ].join("\n"),
  )
  assert.equal(plan.status, "healthy")
  assert.deepEqual(plan.diagnostics, ["restricted_starter_profile"])
  assert.match(plan.updatedSource ?? "", new RegExp(canonicalEndpoint))
})

test("Codex repair keeps a custom allowlist separate from the starter profile", async () => {
  const { planCodexConfigRepair } = await loadSourceModules()
  const plan = planCodexConfigRepair(
    [
      "[mcp_servers.desk-rules-mcp]",
      `url = "${canonicalEndpoint}"`,
      'enabled_tools = ["inspect_mcp_authorization_status"]',
      "",
    ].join("\n"),
  )
  assert.equal(plan.status, "healthy")
  assert.deepEqual(plan.diagnostics, ["custom_enabled_tools"])
})

test("OAuth metadata discovery rejects unsafe issuers", async () => {
  const {
    createAuthorizationServerMetadataUrl,
    inspectAuthorizationServerMetadata,
  } = await loadSourceModules()
  assert.equal(
    createAuthorizationServerMetadataUrl("https://auth.example.com/oauth/v1"),
    "https://auth.example.com/.well-known/oauth-authorization-server/oauth/v1",
  )
  assert.throws(
    () => createAuthorizationServerMetadataUrl("https://[::1]/auth"),
    /not safe/,
  )
  const result = await inspectAuthorizationServerMetadata({
    authorizationServers: ["https://auth.example.com/oauth/v1"],
    fetchJson: async () => ({
      json: {
        client_id_metadata_document_supported: true,
        code_challenge_methods_supported: ["S256"],
        issuer: "https://auth.example.com/oauth/v1",
      },
      response: { ok: true, status: 200 },
    }),
  })
  assert.equal(result.clientRegistrationMode, "client_id_metadata_document")
  assert.equal(result.pkceS256Supported, true)
})

test("built CLI reports its offline compatibility and bundled skill", async () => {
  const manifestModule = await import(manifestModuleUrl)
  const skillsVersion =
    manifestModule.DESK_RULES_MCP_SERVER_MANIFEST.compatibility
      .minimumSkillsVersion as string
  const doctor = spawnSync(
    process.execPath,
    ["package/dist/index.js", "mcp", "doctor", "--offline"],
    { encoding: "utf8" },
  )
  assert.equal(doctor.status, 0, doctor.stderr)
  assert.match(
    doctor.stdout,
    new RegExp(`CLI ${cliVersion.replaceAll(".", "\\.")} meets minimum`),
  )

  const skills = spawnSync(
    process.execPath,
    ["package/dist/index.js", "skills", "list"],
    { encoding: "utf8" },
  )
  assert.equal(skills.status, 0, skills.stderr)
  assert.match(skills.stdout, /desk-rules-mcp/)
  assert.match(
    skills.stdout,
    new RegExp(skillsVersion.replaceAll(".", "\\.")),
  )
})

test("breaking CLI rejects the removed mcp install alias", () => {
  const result = spawnSync(
    process.execPath,
    ["package/dist/index.js", "mcp", "install"],
    { encoding: "utf8" },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unknown command: mcp install/)
  assert.doesNotMatch(result.stderr, /renamed to setup/)
})
