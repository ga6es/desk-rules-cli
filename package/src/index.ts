#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  CodexConfigApplyError,
  applyCodexConfigRepair,
  inspectCodexConfigFile,
  resolveCodexConfigPath,
  type CodexConfigDiagnosticCode,
  type CodexConfigProfileIntent,
  type CodexConfigRepairPlan,
} from "./codex-config-repair.js"
import {
  DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES,
  DESK_RULES_MCP_SERVER_MANIFEST,
} from "./manifest.js"
import { inspectAuthorizationServerMetadata } from "./oauth-metadata.js"

type CliCheckStatus = "fail" | "pass" | "warn"

type CliCheck = {
  message: string
  name: string
  status: CliCheckStatus
}

type ParsedArgs = {
  command: string[]
  flags: Map<string, string | true>
}

type CodexRepairArgs = {
  apply: boolean
  configPath: string | null
  json: boolean
  profile: CodexConfigProfileIntent
}

type CodexSetupArgs = {
  endpoint: string | null
  profile: "full" | "starter"
}

const DEFAULT_TIMEOUT_MS = 10_000
const PUBLIC_DOCS_ORIGIN = "https://deskrules.com"
const DOCS_PATH = "/docs/mcp"
const PROMPT_DOCS_PATH = "/docs/mcp/prompt.md"

function readCurrentCliVersion() {
  const packageMetadata = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown }

  if (
    typeof packageMetadata.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(packageMetadata.version)
  ) {
    throw new Error("The Desk Rules CLI package version is invalid.")
  }

  return packageMetadata.version
}

const CURRENT_CLI_VERSION = readCurrentCliVersion()
const BUNDLED_SKILLS = [
  {
    name: "desk-rules-mcp",
    packagePath: "skills/desk-rules-mcp",
    version: DESK_RULES_MCP_SERVER_MANIFEST.compatibility.currentSkillsVersion,
  },
] as const

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command: string[] = []
  const flags = new Map<string, string | true>()

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (!value.startsWith("--")) {
      command.push(value)
      continue
    }

    const withoutPrefix = value.slice(2)
    const equalsIndex = withoutPrefix.indexOf("=")
    if (equalsIndex !== -1) {
      flags.set(
        withoutPrefix.slice(0, equalsIndex),
        withoutPrefix.slice(equalsIndex + 1),
      )
      continue
    }

    const nextValue = argv[index + 1]
    if (nextValue && !nextValue.startsWith("--")) {
      flags.set(withoutPrefix, nextValue)
      index += 1
      continue
    }

    flags.set(withoutPrefix, true)
  }

  return { command, flags }
}

function readFlag(flags: Map<string, string | true>, name: string) {
  const value = flags.get(name)
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null
}

function hasFlag(flags: Map<string, string | true>, name: string) {
  return flags.get(name) === true
}

function parseCodexRepairArgs(argv: readonly string[]): CodexRepairArgs {
  const seen = new Set<string>()
  let apply = false
  let configPath: string | null = null
  let json = false
  let profile: CodexConfigProfileIntent = "preserve"

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (!value.startsWith("--") || value.includes("=")) {
      throw new Error(
        "Codex repair accepts only --apply, --config <path>, --profile <full|starter>, and --json.",
      )
    }
    const name = value.slice(2)
    if (
      !["apply", "config", "json", "profile"].includes(name) ||
      seen.has(name)
    ) {
      throw new Error("Codex repair received an unknown or duplicate flag.")
    }
    seen.add(name)

    if (name === "apply") {
      apply = true
      continue
    }
    if (name === "json") {
      json = true
      continue
    }

    const nextValue = argv[index + 1]
    if (!nextValue || nextValue.startsWith("--")) {
      throw new Error(`--${name} requires one value.`)
    }
    index += 1
    if (name === "config") {
      configPath = nextValue
      continue
    }
    if (nextValue !== "full" && nextValue !== "starter") {
      throw new Error("Codex repair profile must be full or starter.")
    }
    profile = nextValue
  }

  return { apply, configPath, json, profile }
}

function parseCodexSetupArgs(argv: readonly string[]): CodexSetupArgs {
  const seen = new Set<string>()
  let endpoint: string | null = null
  let profile: CodexSetupArgs["profile"] = "starter"

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (!value.startsWith("--") || value.includes("=")) {
      throw new Error(
        "Codex setup accepts only --endpoint <url> and --profile <full|starter>.",
      )
    }
    const name = value.slice(2)
    if (!["endpoint", "profile"].includes(name) || seen.has(name)) {
      throw new Error("Codex setup received an unknown or duplicate flag.")
    }
    seen.add(name)

    const nextValue = argv[index + 1]
    if (!nextValue || nextValue.startsWith("--")) {
      throw new Error(`Codex setup requires a value for --${name}.`)
    }
    index += 1

    if (name === "endpoint") {
      endpoint = nextValue
      continue
    }
    if (nextValue !== "full" && nextValue !== "starter") {
      throw new Error("Codex setup profile must be full or starter.")
    }
    profile = nextValue
  }

  return { endpoint, profile }
}

function readEndpoint(flags: Map<string, string | true>) {
  return (
    readFlag(flags, "endpoint") ??
    DESK_RULES_MCP_SERVER_MANIFEST.canonicalEndpoint
  )
}

function createDocsUrl(endpoint: string) {
  new URL(endpoint)
  return `${PUBLIC_DOCS_ORIGIN}${DOCS_PATH}`
}

function createPromptDocsUrl(endpoint: string) {
  new URL(endpoint)
  return `${PUBLIC_DOCS_ORIGIN}${PROMPT_DOCS_PATH}`
}

function createProtectedResourceMetadataUrl(endpoint: string) {
  const url = new URL(endpoint)
  return `${url.origin}/.well-known/oauth-protected-resource`
}

function compareVersions(actual: string, minimum: string) {
  const actualParts = actual.split(".").map((part) => Number.parseInt(part, 10))
  const minimumParts = minimum
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  const maxLength = Math.max(actualParts.length, minimumParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const actualPart = Number.isFinite(actualParts[index])
      ? actualParts[index]!
      : 0
    const minimumPart = Number.isFinite(minimumParts[index])
      ? minimumParts[index]!
      : 0
    if (actualPart > minimumPart) return 1
    if (actualPart < minimumPart) return -1
  }

  return 0
}

function addVersionCheck(
  checks: CliCheck[],
  label: string,
  actualVersion: string | null,
  minimumVersion: string,
) {
  if (!actualVersion) {
    checks.push({
      message: `Unknown installed ${label} version. Pass --${label.toLowerCase()}-version when checking a plugin or skills bundle.`,
      name: `${label} version`,
      status: "warn",
    })
    return
  }

  const status =
    compareVersions(actualVersion, minimumVersion) >= 0 ? "pass" : "fail"
  checks.push({
    message:
      status === "pass"
        ? `${label} ${actualVersion} meets minimum ${minimumVersion}.`
        : `${label} ${actualVersion} is below minimum ${minimumVersion}; update the ${label.toLowerCase()} and rerun doctor.`,
    name: `${label} version`,
    status,
  })
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...init,
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJsonWithTimeout(url: string) {
  const response = await fetchWithTimeout(url)
  const json = await response.json().catch(() => null)
  return { json, response }
}

async function runDoctor(flags: Map<string, string | true>) {
  const endpoint = readEndpoint(flags)
  const offline = hasFlag(flags, "offline")
  const checks: CliCheck[] = []
  let liveEndpointIsSafe = false

  try {
    const parsedEndpoint = new URL(endpoint)
    const isLocalEndpoint =
      parsedEndpoint.hostname === "localhost" ||
      parsedEndpoint.hostname === "127.0.0.1"
    liveEndpointIsSafe =
      parsedEndpoint.protocol === "https:" || isLocalEndpoint

    checks.push({
      message: `${endpoint} is a valid ${parsedEndpoint.protocol.replace(":", "")} URL.`,
      name: "endpoint url",
      status:
        liveEndpointIsSafe ? "pass" : "fail",
    })
  } catch {
    checks.push({
      message: `${endpoint} is not a valid MCP endpoint URL.`,
      name: "endpoint url",
      status: "fail",
    })
  }

  addVersionCheck(
    checks,
    "CLI",
    readFlag(flags, "cli-version") ?? CURRENT_CLI_VERSION,
    DESK_RULES_MCP_SERVER_MANIFEST.compatibility.minimumCliVersion,
  )
  addVersionCheck(
    checks,
    "Plugin",
    readFlag(flags, "plugin-version"),
    DESK_RULES_MCP_SERVER_MANIFEST.compatibility.minimumPluginVersion,
  )
  addVersionCheck(
    checks,
    "Skills",
    readFlag(flags, "skills-version"),
    DESK_RULES_MCP_SERVER_MANIFEST.compatibility.minimumSkillsVersion,
  )

  const client = readFlag(flags, "client")
  if (client && client !== "codex") {
    checks.push({
      message: "Only the codex client diagnostic is currently supported.",
      name: "client config",
      status: "fail",
    })
  } else if (client === "codex") {
    const configPath = resolveCodexConfigPath(readFlag(flags, "config"))
    const plan = inspectCodexConfigFile(configPath)
    checks.push(...createCodexConfigChecks(plan))
  }

  if (offline) {
    checks.push({
      message: "Skipped live metadata and auth-gate checks because --offline was supplied.",
      name: "live metadata",
      status: "warn",
    })
    return { checks, endpoint }
  }
  if (!liveEndpointIsSafe) {
    checks.push({
      message:
        "Skipped live metadata and auth-gate checks because the endpoint URL is unsafe.",
      name: "live metadata",
      status: "warn",
    })
    return { checks, endpoint }
  }

  try {
    const metadataUrl = createProtectedResourceMetadataUrl(endpoint)
    const { json, response } = await fetchJsonWithTimeout(metadataUrl)
    const metadata =
      json && typeof json === "object" ? (json as Record<string, unknown>) : {}
    const authorizationServers = metadata.authorization_servers
    const resource = metadata.resource

    checks.push({
      message: `Protected-resource metadata returned HTTP ${response.status}.`,
      name: "protected-resource metadata",
      status: response.ok ? "pass" : "fail",
    })
    checks.push({
      message: Array.isArray(authorizationServers)
        ? "Metadata includes authorization_servers."
        : "Metadata is missing authorization_servers.",
      name: "authorization servers",
      status: Array.isArray(authorizationServers) ? "pass" : "fail",
    })
    checks.push({
      message:
        resource === endpoint
          ? "Metadata resource matches the MCP endpoint."
          : `Metadata resource is ${String(resource)}; expected ${endpoint}.`,
      name: "resource origin",
      status: resource === endpoint ? "pass" : "fail",
    })
    const authorizationInspection =
      await inspectAuthorizationServerMetadata({
        authorizationServers,
        fetchJson: fetchJsonWithTimeout,
      })
    checks.push({
      message: `Authorization-server metadata returned HTTP ${authorizationInspection.metadataHttpStatus}.`,
      name: "authorization server metadata",
      status:
        authorizationInspection.metadataHttpStatus >= 200 &&
        authorizationInspection.metadataHttpStatus < 300
          ? "pass"
          : "fail",
    })
    checks.push({
      message: authorizationInspection.issuerMatches
        ? "Authorization-server metadata issuer matches protected-resource discovery."
        : "Authorization-server issuer changed or does not match. Reconnect Desk Rules MCP instead of reusing cached client registration.",
      name: "authorization server issuer",
      status: authorizationInspection.issuerMatches ? "pass" : "fail",
    })
    checks.push({
      message: authorizationInspection.pkceS256Supported
        ? "Authorization server supports PKCE S256."
        : "Authorization server does not advertise required PKCE S256 support.",
      name: "authorization server PKCE",
      status: authorizationInspection.pkceS256Supported ? "pass" : "fail",
    })
    checks.push({
      message:
        authorizationInspection.clientRegistrationMode ===
        "client_id_metadata_document"
          ? "Authorization server supports Client ID Metadata Documents."
          : authorizationInspection.clientRegistrationMode ===
              "dynamic_client_registration"
            ? "Authorization server supports Dynamic Client Registration as the compatibility fallback."
            : "Authorization server requires a pre-registered or manually supplied client.",
      name: "client registration",
      status:
        authorizationInspection.clientRegistrationMode === "manual"
          ? "warn"
          : "pass",
    })
  } catch (error) {
    checks.push({
      message: `Could not complete OAuth metadata discovery: ${error instanceof Error ? error.message : String(error)}`,
      name: "OAuth metadata",
      status: "fail",
    })
  }

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "GET",
    })
    checks.push({
      message:
        response.status === 401
          ? "Unauthenticated MCP request returned expected HTTP 401."
          : `Unauthenticated MCP request returned HTTP ${response.status}; expected 401.`,
      name: "auth gate",
      status:
        response.status === 401 ? "pass" : response.status >= 500 ? "fail" : "warn",
    })
  } catch (error) {
    checks.push({
      message: `Could not reach MCP endpoint: ${error instanceof Error ? error.message : String(error)}`,
      name: "auth gate",
      status: "fail",
    })
  }

  return { checks, endpoint }
}

function readCodexConfigDiagnosticMessage(code: CodexConfigDiagnosticCode) {
  const messages: Record<CodexConfigDiagnosticCode, string> = {
    config_missing:
      "Codex user config was not found. Run `deskrules mcp setup codex` for a canonical block.",
    config_not_regular:
      "Codex config is not a regular file. Repair refused without reading or changing it.",
    config_not_utf8:
      "Codex config is not valid UTF-8. Repair refused.",
    config_too_large:
      "Codex config exceeds the bounded diagnostic size. Repair refused.",
    desk_rules_block_missing:
      "No recognized Desk Rules MCP block was found. Run `deskrules mcp setup codex`.",
    healthy:
      "The Desk Rules MCP block uses the canonical endpoint and requested discovery profile.",
    invalid_service_tier:
      "The global service_tier value `default` is unsupported. Remove that line manually; Desk Rules repair will not change global Codex settings.",
    malformed_toml:
      "Codex config is malformed TOML. Repair refused; fix the syntax or restore a known-good backup.",
    restricted_starter_profile:
      "The recognized Desk Rules block uses the current explicit starter profile.",
    stale_enabled_tools:
      "The selected profile differs from the current enabled_tools allowlist.",
    custom_enabled_tools:
      "The recognized Desk Rules block has a custom enabled_tools allowlist. It was preserved because no profile change was requested.",
    unsupported_desk_rules_block:
      "The Desk Rules block uses an unsupported or mixed structure. Repair refused.",
  }
  return messages[code]
}

function createCodexConfigChecks(plan: CodexConfigRepairPlan): CliCheck[] {
  return plan.diagnostics.map((code) => ({
    message: readCodexConfigDiagnosticMessage(code),
    name: `codex config ${code.replaceAll("_", " ")}`,
    status:
      code === "healthy"
        ? "pass"
        : code === "restricted_starter_profile" ||
            code === "custom_enabled_tools" ||
            code === "config_missing" ||
            code === "desk_rules_block_missing"
          ? "warn"
          : "fail",
  }))
}

function printChecks(checks: readonly CliCheck[]) {
  for (const check of checks) {
    const label =
      check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"
    process.stdout.write(`${label} ${check.name}: ${check.message}\n`)
  }
}

function hasFailures(checks: readonly CliCheck[]) {
  return checks.some((check) => check.status === "fail")
}

async function printDoctor(flags: Map<string, string | true>) {
  const result = await runDoctor(flags)
  const payload = {
    billingPath: DESK_RULES_MCP_SERVER_MANIFEST.recoveryPaths.billing,
    checks: result.checks,
    docsUrl: createDocsUrl(result.endpoint),
    endpoint: result.endpoint,
    expectedManifestVersion: DESK_RULES_MCP_SERVER_MANIFEST.manifestVersion,
    pricingPath: DESK_RULES_MCP_SERVER_MANIFEST.recoveryPaths.pricing,
    protocolCompatibility:
      DESK_RULES_MCP_SERVER_MANIFEST.protocolCompatibility,
  }

  if (hasFlag(flags, "json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  } else {
    process.stdout.write("Desk Rules MCP doctor\n")
    process.stdout.write(`Endpoint: ${result.endpoint}\n`)
    process.stdout.write(
      `Expected package manifest: ${payload.expectedManifestVersion}\n`,
    )
    process.stdout.write(
      `Protocol: MCP ${payload.protocolCompatibility.modern.protocolVersion} with automatic stateless legacy fallback\n`,
    )
    process.stdout.write(
      "Durable MCP Tasks: not advertised; exports complete synchronously\n",
    )
    printChecks(result.checks)
    process.stdout.write(`Docs: ${payload.docsUrl}\n`)
    process.stdout.write(
      `Billing: ${PUBLIC_DOCS_ORIGIN}${payload.billingPath}\n`,
    )
    process.stdout.write(
      `Pricing: ${PUBLIC_DOCS_ORIGIN}${payload.pricingPath}\n`,
    )
    process.stdout.write(
      "Billing diagnostics never quote prices or recommend a plan; the live Pricing page is authoritative.\n",
    )
    process.stdout.write("Next: authenticate Desk Rules MCP in your agent.\n")
  }
  process.exitCode = hasFailures(result.checks) ? 1 : 0
}

function printCodexSetup(args: CodexSetupArgs) {
  const endpoint = readEndpoint(
    new Map(args.endpoint ? [["endpoint", args.endpoint]] : []),
  )
  const profileLines =
    args.profile === "starter"
      ? [
          "",
          "# Explicit restricted starter profile generated from the Desk Rules manifest.",
          "enabled_tools = [",
          ...DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES.map(
            (toolName) => `  "${toolName}",`,
          ),
          "]",
        ]
      : []
  process.stdout.write(
    [
      "Desk Rules MCP Codex setup",
      `Profile: ${args.profile}`,
      "",
      "Use this manual configuration only when the Desk Rules plugin is not installed:",
      "",
      "[mcp_servers.desk-rules-mcp]",
      `url = "${endpoint}"`,
      'auth = "oauth"',
      'default_tools_approval_mode = "writes"',
      "tool_timeout_sec = 120",
      ...profileLines,
      "",
      "Then open Codex, authenticate Desk Rules MCP, and run /mcp to confirm it is connected.",
      "Compatible clients negotiate modern MCP automatically with stateless legacy fallback.",
      args.profile === "full"
        ? DESK_RULES_MCP_SERVER_MANIFEST.clientProfiles.full.description
        : DESK_RULES_MCP_SERVER_MANIFEST.clientProfiles.default.description,
      DESK_RULES_MCP_SERVER_MANIFEST.compatibility.reconnectPolicy.permissionInvariant,
      `Docs: ${createDocsUrl(endpoint)}`,
      `Agent setup prompt: ${createPromptDocsUrl(endpoint)}`,
      "",
    ].join("\n"),
  )
}

function printClaudeSetup(flags: Map<string, string | true>) {
  const endpoint = readEndpoint(flags)
  process.stdout.write(
    [
      "Desk Rules MCP Claude setup",
      "",
      "Run:",
      `claude mcp add --transport http desk-rules-mcp ${endpoint}`,
      "",
      "Then use Claude's MCP connection flow to authenticate Desk Rules MCP.",
      "Compatible clients negotiate modern MCP automatically with stateless legacy fallback.",
      `Docs: ${createDocsUrl(endpoint)}`,
      `Agent setup prompt: ${createPromptDocsUrl(endpoint)}`,
      "",
    ].join("\n"),
  )
}

function printCodexRepairResult(input: {
  applied: boolean
  backupCreated: boolean
  json: boolean
  plan: CodexConfigRepairPlan
  status: "applied" | "blocked" | "changes_available" | "no_change"
}) {
  const payload = {
    actions: input.plan.actions,
    backupCreated: input.backupCreated,
    diagnostics: input.plan.diagnostics,
    mode: input.applied ? "apply" : "dry-run",
    status: input.status,
  }

  if (input.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }

  process.stdout.write("Desk Rules MCP Codex config repair\n")
  process.stdout.write(`Mode: ${payload.mode}\n`)
  process.stdout.write(`Status: ${payload.status}\n`)
  for (const diagnostic of input.plan.diagnostics) {
    process.stdout.write(`- ${readCodexConfigDiagnosticMessage(diagnostic)}\n`)
  }
  if (input.plan.actions.length > 0) {
    process.stdout.write("Planned Desk Rules changes:\n")
    for (const action of input.plan.actions) {
      process.stdout.write(`- ${action}\n`)
    }
  }
  if (!input.applied && input.status === "changes_available") {
    process.stdout.write(
      "No files changed. Re-run with --apply to authorize this exact scoped repair.\n",
    )
  }
  if (input.backupCreated) {
    process.stdout.write(
      "A timestamped backup was created beside the Codex config before replacement.\n",
    )
  }
}

function printCodexRepair(args: CodexRepairArgs) {
  const configPath = resolveCodexConfigPath(args.configPath)
  const plan = inspectCodexConfigFile(configPath, args.profile)

  if (!plan.safeToApply) {
    printCodexRepairResult({
      applied: args.apply,
      backupCreated: false,
      json: args.json,
      plan,
      status: "blocked",
    })
    process.exitCode = 1
    return
  }

  if (!args.apply) {
    printCodexRepairResult({
      applied: false,
      backupCreated: false,
      json: args.json,
      plan,
      status: plan.actions.length > 0 ? "changes_available" : "no_change",
    })
    return
  }

  try {
    const result = applyCodexConfigRepair(configPath, plan)
    printCodexRepairResult({
      applied: true,
      backupCreated: result.backupCreated,
      json: args.json,
      plan,
      status: result.status,
    })
  } catch (error) {
    const diagnostic =
      error instanceof CodexConfigApplyError && error.code === "config_changed"
        ? "Codex config changed after inspection. No replacement occurred; run the dry-run again."
        : "Codex config replacement failed. The original file was not intentionally removed or truncated."
    const backupCreated =
      error instanceof CodexConfigApplyError ? error.backupCreated : false
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            actions: plan.actions,
            backupCreated,
            diagnostics: ["filesystem_failure"],
            mode: "apply",
            status: "blocked",
          },
          null,
          2,
        )}\n`,
      )
    } else {
      process.stdout.write("Desk Rules MCP Codex config repair\n")
      process.stdout.write("Mode: apply\n")
      process.stdout.write("Status: blocked\n")
      process.stdout.write(`- ${diagnostic}\n`)
      if (backupCreated) {
        process.stdout.write(
          "A timestamped backup was created before the failed replacement.\n",
        )
      }
    }
    process.exitCode = 1
  }
}

function printUpdateGuidance() {
  const compatibility = DESK_RULES_MCP_SERVER_MANIFEST.compatibility
  process.stdout.write(
    [
      "Desk Rules update guidance",
      "",
      `Installed CLI version: ${CURRENT_CLI_VERSION}`,
      `Current CLI bundle version: ${DESK_RULES_MCP_SERVER_MANIFEST.cli.currentVersion}`,
      `Current plugin bundle version: ${compatibility.currentPluginVersion}`,
      `Current skills bundle version: ${compatibility.currentSkillsVersion}`,
      `Minimum CLI version: ${compatibility.minimumCliVersion}`,
      `Minimum plugin version: ${compatibility.minimumPluginVersion}`,
      `Minimum skills version: ${compatibility.minimumSkillsVersion}`,
      `Package manifest version: ${DESK_RULES_MCP_SERVER_MANIFEST.manifestVersion}`,
      `Modern MCP protocol: ${DESK_RULES_MCP_SERVER_MANIFEST.protocolCompatibility.modern.protocolVersion}`,
      `Legacy fallback: ${DESK_RULES_MCP_SERVER_MANIFEST.protocolCompatibility.legacy.protocolVersion} (${DESK_RULES_MCP_SERVER_MANIFEST.protocolCompatibility.legacy.mode})`,
      "Durable MCP Tasks: not advertised; exports complete synchronously",
      "",
      "CLI one-time run:",
      `${DESK_RULES_MCP_SERVER_MANIFEST.cli.npmRunCommand} mcp doctor`,
      "",
      "CLI persistent install/update:",
      DESK_RULES_MCP_SERVER_MANIFEST.cli.npmPersistentInstallCommand,
      "npm update -g @desk-rules/cli",
      "",
      "Plugin updates happen through Codex plugin update/install flow once the plugin is available.",
      "Bundled skills are included in this CLI package; run `deskrules skills list` to locate them.",
      compatibility.reconnectPolicy.capabilityChange,
      compatibility.reconnectPolicy.endpointChange,
      compatibility.reconnectPolicy.permissionInvariant,
      "Account workflow permissions are managed in Desk Rules Account > Agent. Re-run authorization inspection after changing them.",
      "Publishing requires explicit approval for every specific publication even when authorization inspection reports Publish available.",
      `Agent setup prompt: ${PUBLIC_DOCS_ORIGIN}${PROMPT_DOCS_PATH}`,
      "Standalone binaries are planned; npm is the first CLI distribution channel, not the only long-term channel.",
      "",
    ].join("\n"),
  )
}

function readPackageRootPath() {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

function printSkillsList() {
  const packageRoot = readPackageRootPath()
  process.stdout.write("Desk Rules bundled skills\n")
  process.stdout.write(`Package: ${DESK_RULES_MCP_SERVER_MANIFEST.cli.npmPackageName}\n`)
  process.stdout.write(
    `MCP endpoint: ${DESK_RULES_MCP_SERVER_MANIFEST.canonicalEndpoint}\n`,
  )
  process.stdout.write(
    "MCP is the capability layer. Skills are the behavior layer for compatible agents.\n\n",
  )
  process.stdout.write(
    `Agent setup prompt: ${PUBLIC_DOCS_ORIGIN}${PROMPT_DOCS_PATH}\n\n`,
  )

  for (const skill of BUNDLED_SKILLS) {
    process.stdout.write(`- ${skill.name}\n`)
    process.stdout.write(`  Version: ${skill.version}\n`)
    process.stdout.write(`  Path: ${join(packageRoot, skill.packagePath)}\n`)
  }
}

function printHelp() {
  process.stdout.write(
    [
      "Desk Rules CLI",
      "",
      "Commands:",
      "  deskrules mcp doctor [--client codex] [--config <path>] [--endpoint <url>] [--offline] [--json] [--cli-version <x>] [--plugin-version <x>] [--skills-version <x>]",
      "  deskrules mcp repair codex [--config <path>] [--profile <full|starter>] [--apply] [--json]",
      "  deskrules mcp setup codex [--endpoint <url>] [--profile <full|starter>]",
      "  deskrules mcp setup claude [--endpoint <url>]",
      "  deskrules update",
      "  deskrules skills list",
      "  deskrules help",
      "",
      "The CLI diagnoses setup and update state. Design work still happens through Desk Rules MCP tools inside the authenticated agent.",
      `Agent setup prompt: ${PUBLIC_DOCS_ORIGIN}${PROMPT_DOCS_PATH}`,
      "",
    ].join("\n"),
  )
}

async function main() {
  const argv = process.argv.slice(2)
  if (
    argv[0] === "mcp" &&
    argv[1] === "repair" &&
    argv[2] === "codex"
  ) {
    printCodexRepair(parseCodexRepairArgs(argv.slice(3)))
    return
  }
  if (
    argv[0] === "mcp" &&
    argv[1] === "setup" &&
    argv[2] === "codex"
  ) {
    printCodexSetup(parseCodexSetupArgs(argv.slice(3)))
    return
  }

  const parsed = parseArgs(argv)
  const [first, second, third] = parsed.command

  if (!first || first === "help" || first === "--help" || first === "-h") {
    printHelp()
    return
  }

  if (first === "update") {
    printUpdateGuidance()
    return
  }

  if (first === "skills" && second === "list") {
    printSkillsList()
    return
  }

  if (first === "mcp" && second === "doctor") {
    await printDoctor(parsed.flags)
    return
  }

  if (first === "mcp" && second === "setup" && third === "claude") {
    printClaudeSetup(parsed.flags)
    return
  }

  process.stderr.write(`Unknown command: ${parsed.command.join(" ")}\n\n`)
  printHelp()
  process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
