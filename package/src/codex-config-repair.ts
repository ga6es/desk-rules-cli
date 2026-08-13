import { createHash, randomUUID } from "node:crypto"
import {
  closeSync,
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { parse } from "smol-toml"
import {
  DESK_RULES_MCP_SERVER_MANIFEST,
  DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES,
} from "./manifest.js"

const MAX_CODEX_CONFIG_BYTES = 1_000_000
const INVALID_SERVICE_TIER = "default"

export type CodexConfigDiagnosticCode =
  | "ambiguous_desk_rules_blocks"
  | "config_missing"
  | "config_not_regular"
  | "config_not_utf8"
  | "config_too_large"
  | "desk_rules_block_missing"
  | "healthy"
  | "invalid_service_tier"
  | "legacy_server_name"
  | "malformed_toml"
  | "noncanonical_endpoint"
  | "restricted_starter_profile"
  | "stale_enabled_tools"
  | "custom_enabled_tools"
  | "unsupported_desk_rules_block"

export type CodexConfigRepairAction =
  | "remove_enabled_tools"
  | "replace_enabled_tools"
  | "replace_endpoint"

export type CodexConfigProfileIntent = "full" | "preserve" | "starter"

export type CodexConfigRepairPlan = {
  actions: CodexConfigRepairAction[]
  diagnostics: CodexConfigDiagnosticCode[]
  safeToApply: boolean
  sourceHash: string | null
  status: "blocked" | "fixable" | "healthy" | "missing"
  updatedSource: string | null
}

export type CodexConfigApplyResult = {
  backupCreated: boolean
  status: "applied" | "no_change"
}

export class CodexConfigApplyError extends Error {
  readonly backupCreated: boolean
  readonly code: "config_changed" | "filesystem_failure"

  constructor(
    code: "config_changed" | "filesystem_failure",
    backupCreated: boolean,
  ) {
    super(code)
    this.name = "CodexConfigApplyError"
    this.backupCreated = backupCreated
    this.code = code
  }
}

type ApplyDependencies = {
  beforeReplace?: () => void
  renameFile?: (sourcePath: string, destinationPath: string) => void
}

type SourceLine = {
  content: string
  end: number
  start: number
}

type SourceEdit = {
  end: number
  replacement: string
  start: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function fingerprint(source: string | Buffer) {
  return createHash("sha256").update(source).digest("hex")
}

function splitSourceLines(source: string) {
  const lines: SourceLine[] = []
  let start = 0

  while (start < source.length) {
    const newlineIndex = source.indexOf("\n", start)
    const end = newlineIndex === -1 ? source.length : newlineIndex + 1
    let contentEnd = end
    if (newlineIndex !== -1) contentEnd -= 1
    if (contentEnd > start && source[contentEnd - 1] === "\r") contentEnd -= 1
    lines.push({
      content: source.slice(start, contentEnd),
      end,
      start,
    })
    start = end
  }

  return lines
}

function readMcpServerName(line: string) {
  const match = line.match(
    /^\s*\[\s*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]\s*(?:#.*)?$/,
  )
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function isTableHeader(line: string) {
  return /^\s*\[\[?.+\]\]?\s*(?:#.*)?$/.test(line)
}

function recognizedServerNames() {
  const aliases = DESK_RULES_MCP_SERVER_MANIFEST.legacyAliases
    .filter((entry) => entry.kind === "client_config_name")
    .map((entry) => entry.alias)
  return new Set<string>([
    DESK_RULES_MCP_SERVER_MANIFEST.serverName,
    ...aliases,
  ])
}

function recognizedLegacyEndpoints() {
  return new Set<string>(
    DESK_RULES_MCP_SERVER_MANIFEST.legacyEndpoints.map(
      (entry) => entry.endpoint,
    ),
  )
}

function renderStarterProfile(newline: string) {
  return [
    "enabled_tools = [",
    ...DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES.map(
      (toolName) => `  "${toolName}",`,
    ),
    "]",
    "",
  ].join(newline)
}

function findArrayAssignmentEnd(
  source: string,
  assignmentStart: number,
  blockEnd: number,
) {
  const assignment = source.slice(assignmentStart, blockEnd)
  const equalsIndex = assignment.indexOf("=")
  if (equalsIndex === -1) return null
  if (assignment.includes('"""') || assignment.includes("'''")) return null

  let bracketDepth = 0
  let comment = false
  let escaped = false
  let quote: "'" | '"' | null = null
  let sawOpeningBracket = false

  for (let index = equalsIndex + 1; index < assignment.length; index += 1) {
    const character = assignment[index]!

    if (comment) {
      if (character === "\n") comment = false
      continue
    }
    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false
        continue
      }
      if (quote === '"' && character === "\\") {
        escaped = true
        continue
      }
      if (character === quote) quote = null
      continue
    }
    if (character === "#") {
      comment = true
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "[") {
      bracketDepth += 1
      sawOpeningBracket = true
      continue
    }
    if (character === "]" && sawOpeningBracket) {
      bracketDepth -= 1
      if (bracketDepth === 0) {
        const absoluteEnd = assignmentStart + index + 1
        const lineEnd = source.indexOf("\n", absoluteEnd)
        return lineEnd === -1 ? source.length : lineEnd + 1
      }
    }
  }

  return null
}

function applySourceEdits(source: string, edits: readonly SourceEdit[]) {
  let updated = source
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    updated =
      updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end)
  }
  return updated
}

function blockedPlan(
  diagnostics: CodexConfigDiagnosticCode[],
): CodexConfigRepairPlan {
  return {
    actions: [],
    diagnostics,
    safeToApply: false,
    sourceHash: null,
    status: "blocked",
    updatedSource: null,
  }
}

export function planCodexConfigRepair(
  sourceWithOptionalBom: string,
  profileIntent: CodexConfigProfileIntent = "preserve",
) {
  const hasBom = sourceWithOptionalBom.startsWith("\uFEFF")
  const source = hasBom ? sourceWithOptionalBom.slice(1) : sourceWithOptionalBom
  let parsed: unknown

  try {
    parsed = parse(source)
  } catch {
    return blockedPlan(["malformed_toml"])
  }

  if (!isRecord(parsed)) return blockedPlan(["malformed_toml"])

  const diagnostics: CodexConfigDiagnosticCode[] = []
  if (parsed.service_tier === INVALID_SERVICE_TIER) {
    diagnostics.push("invalid_service_tier")
  }

  const servers = isRecord(parsed.mcp_servers) ? parsed.mcp_servers : {}
  const recognizedNames = recognizedServerNames()
  const candidateNames = Object.keys(servers).filter((name) =>
    recognizedNames.has(name),
  )

  if (candidateNames.length === 0) {
    return {
      actions: [],
      diagnostics: [...diagnostics, "desk_rules_block_missing"],
      safeToApply: false,
      sourceHash: fingerprint(sourceWithOptionalBom),
      status: diagnostics.length > 0 ? "blocked" : "missing",
      updatedSource: null,
    } satisfies CodexConfigRepairPlan
  }
  if (candidateNames.length > 1) {
    return blockedPlan([...diagnostics, "ambiguous_desk_rules_blocks"])
  }

  const serverName = candidateNames[0]!
  const serverConfig = servers[serverName]
  if (!isRecord(serverConfig)) {
    return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
  }
  if (
    typeof serverConfig.command === "string" ||
    Array.isArray(serverConfig.args) ||
    typeof serverConfig.cwd === "string"
  ) {
    return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
  }
  if (typeof serverConfig.url !== "string") {
    return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
  }

  const lines = splitSourceLines(source)
  const matchingHeaders = lines
    .map((line, index) => ({ index, name: readMcpServerName(line.content) }))
    .filter((entry) => entry.name === serverName)
  if (matchingHeaders.length !== 1) {
    return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
  }

  const headerIndex = matchingHeaders[0]!.index
  const headerLine = lines[headerIndex]!
  const nextHeader = lines
    .slice(headerIndex + 1)
    .find((line) => isTableHeader(line.content))
  const blockEnd = nextHeader?.start ?? source.length
  const blockLines = lines.filter(
    (line) => line.start >= headerLine.end && line.start < blockEnd,
  )
  const urlLines = blockLines.filter((line) => /^\s*url\s*=/.test(line.content))
  const enabledToolsLines = blockLines.filter((line) =>
    /^\s*enabled_tools\s*=/.test(line.content),
  )

  if (urlLines.length !== 1 || enabledToolsLines.length > 1) {
    return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
  }

  const actions: CodexConfigRepairAction[] = []
  const edits: SourceEdit[] = []
  const urlLine = urlLines[0]!
  if (
    serverConfig.url !== DESK_RULES_MCP_SERVER_MANIFEST.canonicalEndpoint
  ) {
    if (!recognizedLegacyEndpoints().has(serverConfig.url)) {
      return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
    }
    const urlMatch = urlLine.content.match(
      /^(\s*url\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*')(\s*(?:#.*)?)$/,
    )
    if (!urlMatch) {
      return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
    }
    actions.push("replace_endpoint")
    diagnostics.push("noncanonical_endpoint")
    edits.push({
      end: urlLine.end,
      replacement: `${urlMatch[1]}"${DESK_RULES_MCP_SERVER_MANIFEST.canonicalEndpoint}"${urlMatch[2]}${source.slice(urlLine.content.length + urlLine.start, urlLine.end)}`,
      start: urlLine.start,
    })
  }

  if (Object.hasOwn(serverConfig, "enabled_tools")) {
    if (enabledToolsLines.length !== 1 || !Array.isArray(serverConfig.enabled_tools)) {
      return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
    }
    const enabledToolsLine = enabledToolsLines[0]!
    const assignmentEnd = findArrayAssignmentEnd(
      source,
      enabledToolsLine.start,
      blockEnd,
    )
    if (assignmentEnd === null) {
      return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
    }
    const enabledTools = serverConfig.enabled_tools
    if (!enabledTools.every((toolName) => typeof toolName === "string")) {
      return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
    }
    const matchesStarterProfile =
      enabledTools.length === DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES.length &&
      enabledTools.every(
        (toolName, index) =>
          toolName === DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES[index],
      )
    diagnostics.push(
      matchesStarterProfile
        ? "restricted_starter_profile"
        : profileIntent === "preserve"
          ? "custom_enabled_tools"
          : "stale_enabled_tools",
    )

    if (profileIntent === "full") {
      actions.push("remove_enabled_tools")
      edits.push({
        end: assignmentEnd,
        replacement: "",
        start: enabledToolsLine.start,
      })
    } else if (profileIntent === "starter" && !matchesStarterProfile) {
      const newline = source.includes("\r\n") ? "\r\n" : "\n"
      actions.push("replace_enabled_tools")
      edits.push({
        end: assignmentEnd,
        replacement: renderStarterProfile(newline),
        start: enabledToolsLine.start,
      })
    }
  } else if (profileIntent === "starter") {
    const newline = source.includes("\r\n") ? "\r\n" : "\n"
    const needsLeadingNewline =
      blockEnd > 0 && !source.slice(0, blockEnd).endsWith("\n")
    actions.push("replace_enabled_tools")
    edits.push({
      end: blockEnd,
      replacement: `${needsLeadingNewline ? newline : ""}${renderStarterProfile(newline)}`,
      start: blockEnd,
    })
  }

  if (serverName !== DESK_RULES_MCP_SERVER_MANIFEST.serverName) {
    diagnostics.push("legacy_server_name")
  }
  if (diagnostics.includes("invalid_service_tier")) {
    return {
      actions,
      diagnostics,
      safeToApply: false,
      sourceHash: fingerprint(sourceWithOptionalBom),
      status: "blocked",
      updatedSource: null,
    } satisfies CodexConfigRepairPlan
  }

  if (actions.length === 0) {
    return {
      actions: [],
      diagnostics:
        diagnostics.length > 0 ? diagnostics : ["healthy"],
      safeToApply: true,
      sourceHash: fingerprint(sourceWithOptionalBom),
      status: "healthy",
      updatedSource: sourceWithOptionalBom,
    } satisfies CodexConfigRepairPlan
  }

  const updatedSource = applySourceEdits(source, edits)
  try {
    parse(updatedSource)
  } catch {
    return blockedPlan([...diagnostics, "unsupported_desk_rules_block"])
  }

  return {
    actions,
    diagnostics,
    safeToApply: true,
    sourceHash: fingerprint(sourceWithOptionalBom),
    status: "fixable",
    updatedSource: hasBom ? `\uFEFF${updatedSource}` : updatedSource,
  } satisfies CodexConfigRepairPlan
}

export function resolveCodexConfigPath(overridePath: string | null) {
  if (overridePath) return resolve(overridePath)
  const codexHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : join(homedir(), ".codex")
  return join(codexHome, "config.toml")
}

export function inspectCodexConfigFile(
  configPath: string,
  profileIntent: CodexConfigProfileIntent = "preserve",
) {
  if (!existsSync(configPath)) {
    return {
      actions: [],
      diagnostics: ["config_missing"],
      safeToApply: false,
      sourceHash: null,
      status: "missing",
      updatedSource: null,
    } satisfies CodexConfigRepairPlan
  }

  const file = lstatSync(configPath)
  if (!file.isFile() || file.isSymbolicLink()) {
    return blockedPlan(["config_not_regular"])
  }
  if (file.size > MAX_CODEX_CONFIG_BYTES) {
    return blockedPlan(["config_too_large"])
  }

  const bytes = readFileSync(configPath)
  let source: string
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return blockedPlan(["config_not_utf8"])
  }

  return planCodexConfigRepair(source, profileIntent)
}

function createBackupPath(configPath: string) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.]/g, "")
    .replace("Z", "Z")
  const basePath = `${configPath}.${timestamp}.bak`
  let candidate = basePath
  let collision = 1
  while (existsSync(candidate)) {
    candidate = `${basePath}.${collision}`
    collision += 1
  }
  return candidate
}

export function applyCodexConfigRepair(
  configPath: string,
  plan: CodexConfigRepairPlan,
  dependencies: ApplyDependencies = {},
): CodexConfigApplyResult {
  if (
    !plan.safeToApply ||
    plan.sourceHash === null ||
    plan.updatedSource === null
  ) {
    throw new Error("repair_not_safe")
  }
  if (plan.actions.length === 0) {
    return { backupCreated: false, status: "no_change" }
  }

  const file = lstatSync(configPath)
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error("repair_not_safe")
  }
  const originalBytes = readFileSync(configPath)
  if (fingerprint(originalBytes) !== plan.sourceHash) {
    throw new Error("config_changed")
  }

  const backupPath = createBackupPath(configPath)
  const tempPath = join(
    dirname(configPath),
    `.${basename(configPath)}.deskrules-${process.pid}-${randomUUID()}.tmp`,
  )
  let tempDescriptor: number | null = null

  copyFileSync(configPath, backupPath, constants.COPYFILE_EXCL)
  chmodSync(backupPath, file.mode & 0o777)
  try {
    tempDescriptor = openSync(tempPath, "wx", file.mode & 0o777)
    writeFileSync(tempDescriptor, plan.updatedSource, { encoding: "utf8" })
    fsyncSync(tempDescriptor)
    closeSync(tempDescriptor)
    tempDescriptor = null

    dependencies.beforeReplace?.()
    const currentBytes = readFileSync(configPath)
    if (fingerprint(currentBytes) !== plan.sourceHash) {
      throw new Error("config_changed")
    }

    const renameFile = dependencies.renameFile ?? renameSync
    renameFile(tempPath, configPath)
    return { backupCreated: true, status: "applied" }
  } catch (error) {
    if (tempDescriptor !== null) closeSync(tempDescriptor)
    rmSync(tempPath, { force: true })
    throw new CodexConfigApplyError(
      error instanceof Error && error.message === "config_changed"
        ? "config_changed"
        : "filesystem_failure",
      true,
    )
  }
}
