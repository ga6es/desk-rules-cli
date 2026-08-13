import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

// The package source is supplied by the reviewed export, not duplicated in the
// canonical public-repository template kept in the private monorepo.
const oauthModuleUrl = new URL("../package/src/oauth-metadata.js", import.meta.url).href
const repairModuleUrl = new URL("../package/src/codex-config-repair.js", import.meta.url).href
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

test("Codex repair fails closed and updates a recognized legacy endpoint", async () => {
  const { planCodexConfigRepair } = await loadSourceModules()
  assert.equal(
    planCodexConfigRepair(
      '[mcp_servers.desk-rules-mcp]\nurl = "unterminated\n',
    ).status,
    "blocked",
  )
  const plan = planCodexConfigRepair(
    [
      "[mcp_servers.desk-rules-create-from-story-remote]",
      'url = "https://desk-rules-production.up.railway.app/api/mcp"',
      "",
    ].join("\n"),
  )
  assert.equal(plan.status, "fixable")
  assert.match(plan.updatedSource ?? "", new RegExp(canonicalEndpoint))
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

test("built CLI reports its offline compatibility and bundled skill", () => {
  const doctor = spawnSync(
    process.execPath,
    ["package/dist/index.js", "mcp", "doctor", "--offline"],
    { encoding: "utf8" },
  )
  assert.equal(doctor.status, 0, doctor.stderr)
  assert.match(doctor.stdout, /CLI 0\.1\.8 meets minimum/)

  const skills = spawnSync(
    process.execPath,
    ["package/dist/index.js", "skills", "list"],
    { encoding: "utf8" },
  )
  assert.equal(skills.status, 0, skills.stderr)
  assert.match(skills.stdout, /desk-rules-mcp/)
  assert.match(skills.stdout, /0\.1\.8/)
})
