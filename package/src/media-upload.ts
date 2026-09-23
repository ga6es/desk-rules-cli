import { createHash } from "node:crypto"
import { createReadStream, lstatSync, readFileSync } from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"
import type { CallToolResult, Client } from "@modelcontextprotocol/client"
import type { ProtectedOAuthProvider } from "./oauth-session.js"
import {
  executeRegisteredToolRaw,
  OperationalMcpError,
  sanitizeMachineValue,
} from "./operational-mcp.js"

const MAX_MEDIA_BYTES = 50 * 1024 * 1024
const MAX_BATCH_BYTES = 50 * 1024 * 1024
const MAX_BATCH_FILE_BYTES = 1024 * 1024
const MAX_BATCH_ITEMS = 8
const MAX_BRAND_BATCH_BYTES = 25 * 1024 * 1024
const MAX_BRAND_LOGO_BYTES = 25 * 1024 * 1024
const MAX_BRAND_FONT_BYTES = 10 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1024 * 1024
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_SERVER_ERROR_CODES = new Set([
  "content_hash_mismatch",
  "file_size_mismatch",
  "file_too_large",
  "idempotency_conflict",
  "import_failed",
  "session_expired",
  "session_unavailable",
  "unsupported_media",
  "unsupported_asset",
])

type MediaUploadItem = {
  file: string
  requestId: string
}

export type BrandUploadItem = MediaUploadItem & {
  kind: "font" | "logo"
  label: string
}

export class CliMediaUploadError extends Error {
  constructor(
    readonly code:
      | "batch_invalid"
      | "file_invalid"
      | "file_too_large"
      | "upload_failed"
      | "upload_rejected",
  ) {
    super(code)
    this.name = "CliMediaUploadError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function requireUploadItem(value: unknown): MediaUploadItem {
  if (
    !isRecord(value) ||
    typeof value.file !== "string" ||
    typeof value.requestId !== "string"
  ) {
    throw new CliMediaUploadError("batch_invalid")
  }
  const file = value.file.trim()
  if (!file || !UUID_PATTERN.test(value.requestId)) {
    throw new CliMediaUploadError("batch_invalid")
  }
  return { file, requestId: value.requestId }
}

function readBatchFile(filePath: string) {
  let serialized: string
  try {
    const stats = lstatSync(filePath)
    if (!stats.isFile() || stats.size > MAX_BATCH_FILE_BYTES) {
      throw new Error("invalid batch file")
    }
    serialized = readFileSync(filePath, "utf8")
  } catch {
    throw new CliMediaUploadError("batch_invalid")
  }
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (
      !Array.isArray(parsed) ||
      parsed.length < 1 ||
      parsed.length > MAX_BATCH_ITEMS
    ) {
      throw new Error("invalid batch")
    }
    const items = parsed.map(requireUploadItem)
    if (new Set(items.map((item) => item.requestId)).size !== items.length) {
      throw new Error("duplicate request id")
    }
    return items
  } catch (error) {
    if (error instanceof CliMediaUploadError) throw error
    throw new CliMediaUploadError("batch_invalid")
  }
}

function requireBrandUploadItem(value: unknown): BrandUploadItem {
  const item = requireUploadItem(value)
  if (
    !isRecord(value) ||
    (value.kind !== "font" && value.kind !== "logo") ||
    typeof value.label !== "string"
  ) {
    throw new CliMediaUploadError("batch_invalid")
  }
  const label = value.label.trim().replace(/\s+/g, " ")
  if (!label || label.length > 160)
    throw new CliMediaUploadError("batch_invalid")
  return { ...item, kind: value.kind, label }
}

function readBrandBatchFile(filePath: string) {
  let parsed: unknown
  try {
    const stats = lstatSync(filePath)
    if (!stats.isFile() || stats.size > MAX_BATCH_FILE_BYTES)
      throw new Error("invalid")
    parsed = JSON.parse(readFileSync(filePath, "utf8"))
  } catch {
    throw new CliMediaUploadError("batch_invalid")
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > MAX_BATCH_ITEMS
  ) {
    throw new CliMediaUploadError("batch_invalid")
  }
  const items = parsed.map(requireBrandUploadItem)
  if (new Set(items.map((item) => item.requestId)).size !== items.length) {
    throw new CliMediaUploadError("batch_invalid")
  }
  return items
}

export function readBrandUploadItems(input: {
  batchFile: string | null
  file: string | null
  kind: string | null
  label: string | null
  requestId: string | null
}) {
  if (input.batchFile) {
    if (input.file || input.kind || input.label || input.requestId)
      throw new CliMediaUploadError("batch_invalid")
    return readBrandBatchFile(input.batchFile)
  }
  return [
    requireBrandUploadItem({
      file: input.file,
      kind: input.kind,
      label: input.label,
      requestId: input.requestId,
    }),
  ]
}

export function readMediaUploadItems(input: {
  batchFile: string | null
  file: string | null
  requestId: string | null
}) {
  if (input.batchFile) {
    if (input.file || input.requestId)
      throw new CliMediaUploadError("batch_invalid")
    return readBatchFile(input.batchFile)
  }
  if (!input.file || !input.requestId || !UUID_PATTERN.test(input.requestId)) {
    throw new CliMediaUploadError("batch_invalid")
  }
  return [{ file: input.file, requestId: input.requestId }]
}

export function inspectMediaFile(filePath: string, maxBytes = MAX_MEDIA_BYTES) {
  try {
    const stats = lstatSync(filePath)
    if (!stats.isFile() || stats.size < 1) throw new Error("invalid file")
    if (stats.size > maxBytes) throw new CliMediaUploadError("file_too_large")
    const originalFilename = path.basename(filePath)
    if (
      !originalFilename ||
      originalFilename.length > 255 ||
      /[\u0000-\u001f\u007f]/.test(originalFilename)
    ) {
      throw new Error("invalid filename")
    }
    return { fileSize: stats.size, originalFilename }
  } catch (error) {
    if (error instanceof CliMediaUploadError) throw error
    throw new CliMediaUploadError("file_invalid")
  }
}

export async function hashMediaFile(filePath: string, signal: AbortSignal) {
  const hash = createHash("sha256")
  try {
    for await (const chunk of createReadStream(filePath, { signal })) {
      hash.update(chunk as Buffer)
    }
  } catch {
    signal.throwIfAborted()
    throw new CliMediaUploadError("file_invalid")
  }
  return `sha256:${hash.digest("hex")}`
}

export function readPreparedTransfer(
  result: CallToolResult,
  uploadPrefix = "/api/mcp/uploads",
) {
  if (result.isError || !isRecord(result.structuredContent)) {
    throw new OperationalMcpError("execution_failed")
  }
  const value = result.structuredContent
  if (value.ok === false) throw new OperationalMcpError("execution_failed")
  if (value.status === "ready") {
    return { readyResult: sanitizeMachineValue(value), uploadPath: null }
  }
  if (
    value.status !== "awaiting_bytes" ||
    typeof value.uploadPath !== "string" ||
    typeof value.sessionId !== "string" ||
    !UUID_PATTERN.test(value.sessionId) ||
    value.uploadPath !== `${uploadPrefix}/${value.sessionId}`
  ) {
    throw new OperationalMcpError("capability_mismatch")
  }
  return { readyResult: null, uploadPath: value.uploadPath }
}

async function uploadOneBrandFile(input: {
  approveWrite: boolean
  client: Client
  endpoint: string
  item: BrandUploadItem
  provider: ProtectedOAuthProvider
  signal: AbortSignal
}) {
  const maxBytes =
    input.item.kind === "logo" ? MAX_BRAND_LOGO_BYTES : MAX_BRAND_FONT_BYTES
  const inspected = inspectMediaFile(input.item.file, maxBytes)
  const contentHash = await hashMediaFile(input.item.file, input.signal)
  const { result } = await executeRegisteredToolRaw({
    approvals: { external: false, write: input.approveWrite },
    arguments: {
      contentHash,
      fileSize: inspected.fileSize,
      kind: input.item.kind,
      label: input.item.label,
      originalFilename: inspected.originalFilename,
      requestId: input.item.requestId,
    },
    client: input.client,
    signal: input.signal,
    toolName: "prepare_brand_asset_upload",
  })
  const prepared = readPreparedTransfer(result, "/api/mcp/brand-assets")
  if (prepared.readyResult)
    return { ok: true as const, result: prepared.readyResult }
  const uploaded = await streamPreparedFile({
    accessToken: input.provider.accessToken(),
    endpoint: input.endpoint,
    filePath: input.item.file,
    fileSize: inspected.fileSize,
    requestId: input.item.requestId,
    signal: input.signal,
    uploadPath: prepared.uploadPath!,
  })
  return uploaded.ok ? { ok: true as const, result: uploaded.value } : uploaded
}

function createUploadUrl(endpoint: string, uploadPath: string) {
  const endpointUrl = new URL(endpoint)
  const uploadUrl = new URL(uploadPath, endpointUrl)
  if (
    uploadUrl.origin !== endpointUrl.origin ||
    uploadUrl.pathname !== uploadPath ||
    uploadUrl.search ||
    uploadUrl.hash
  ) {
    throw new OperationalMcpError("capability_mismatch")
  }
  return uploadUrl
}

async function readBoundedUploadResponse(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0")
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new CliMediaUploadError("upload_failed")
  }
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) throw new CliMediaUploadError("upload_failed")
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

async function readUploadResponse(response: Response) {
  const bytes = await readBoundedUploadResponse(response)
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new CliMediaUploadError("upload_failed")
  }
  if (!isRecord(parsed)) throw new CliMediaUploadError("upload_failed")
  if (!response.ok || parsed.status === "error" || parsed.ok === false) {
    if (response.status === 401) {
      return { code: "reauth_required", ok: false as const }
    }
    const serverCode =
      typeof parsed.code === "string" &&
      SAFE_SERVER_ERROR_CODES.has(parsed.code)
        ? parsed.code
        : "upload_rejected"
    return { code: serverCode, ok: false as const }
  }
  return { ok: true as const, value: sanitizeMachineValue(parsed) }
}

export async function streamPreparedFile(input: {
  accessToken: string
  endpoint: string
  filePath: string
  fileSize: number
  requestId: string
  signal: AbortSignal
  uploadPath: string
}) {
  const body = Readable.toWeb(
    createReadStream(input.filePath, { signal: input.signal }),
  )
  let response: Response
  try {
    response = await fetch(createUploadUrl(input.endpoint, input.uploadPath), {
      body: body as BodyInit,
      duplex: "half",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Length": String(input.fileSize),
        "Content-Type": "application/octet-stream",
        "X-Request-ID": input.requestId,
      },
      method: "PUT",
      redirect: "error",
      signal: input.signal,
    } as RequestInit & { duplex: "half" })
  } catch {
    input.signal.throwIfAborted()
    throw new CliMediaUploadError("upload_failed")
  }
  return readUploadResponse(response)
}

async function uploadOneMediaFile(input: {
  approveWrite: boolean
  client: Client
  endpoint: string
  item: MediaUploadItem
  provider: ProtectedOAuthProvider
  signal: AbortSignal
}) {
  const inspected = inspectMediaFile(input.item.file)
  const contentHash = await hashMediaFile(input.item.file, input.signal)
  const { result } = await executeRegisteredToolRaw({
    approvals: { external: false, write: input.approveWrite },
    arguments: {
      contentHash,
      fileSize: inspected.fileSize,
      originalFilename: inspected.originalFilename,
      requestId: input.item.requestId,
    },
    client: input.client,
    signal: input.signal,
    toolName: "prepare_uploaded_asset_upload",
  })
  const prepared = readPreparedTransfer(result)
  if (prepared.readyResult) {
    return { ok: true as const, result: prepared.readyResult }
  }
  const uploaded = await streamPreparedFile({
    accessToken: input.provider.accessToken(),
    endpoint: input.endpoint,
    filePath: input.item.file,
    fileSize: inspected.fileSize,
    requestId: input.item.requestId,
    signal: input.signal,
    uploadPath: prepared.uploadPath!,
  })
  if (!uploaded.ok) return uploaded
  return { ok: true as const, result: uploaded.value }
}

function safeItemErrorCode(error: unknown) {
  if (
    error instanceof CliMediaUploadError ||
    error instanceof OperationalMcpError
  ) {
    return error.code
  }
  return "upload_failed"
}

function appendCancelledItems(input: {
  inspected: Array<{
    item: MediaUploadItem
    originalFilename: string
  }>
  results: Array<Record<string, unknown>>
  startIndex: number
}) {
  for (
    let index = input.startIndex;
    index < input.inspected.length;
    index += 1
  ) {
    const entry = input.inspected[index]!
    input.results.push({
      code: "cancelled",
      ok: false,
      originalFilename: entry.originalFilename,
      requestId: entry.item.requestId,
    })
  }
}

export async function uploadMediaFiles(input: {
  approveWrite: boolean
  client: Client
  endpoint: string
  items: MediaUploadItem[]
  provider: ProtectedOAuthProvider
  signal: AbortSignal
}) {
  const inspected = input.items.map((item) => ({
    item,
    ...inspectMediaFile(item.file),
  }))
  if (
    inspected.reduce((total, item) => total + item.fileSize, 0) >
    MAX_BATCH_BYTES
  ) {
    throw new CliMediaUploadError("file_too_large")
  }
  const results: Array<Record<string, unknown>> = []
  for (let index = 0; index < inspected.length; index += 1) {
    const entry = inspected[index]!
    if (input.signal.aborted) {
      appendCancelledItems({ inspected, results, startIndex: index })
      break
    }
    try {
      const uploaded = await uploadOneMediaFile({ ...input, item: entry.item })
      results.push({
        ...uploaded,
        originalFilename: entry.originalFilename,
        requestId: entry.item.requestId,
      })
    } catch (error) {
      if (input.signal.aborted) {
        results.push({
          code: "execution_uncertain",
          ok: false,
          originalFilename: entry.originalFilename,
          requestId: entry.item.requestId,
        })
        appendCancelledItems({ inspected, results, startIndex: index + 1 })
        break
      }
      results.push({
        code: safeItemErrorCode(error),
        ok: false,
        originalFilename: entry.originalFilename,
        requestId: entry.item.requestId,
      })
    }
  }
  const failedCount = results.filter((result) => result.ok === false).length
  return {
    failedCount,
    ok: failedCount === 0,
    results,
    uploadedCount: results.length - failedCount,
  }
}

export async function uploadBrandFiles(input: {
  approveWrite: boolean
  client: Client
  endpoint: string
  items: BrandUploadItem[]
  provider: ProtectedOAuthProvider
  signal: AbortSignal
}) {
  const inspected = input.items.map((item) => ({
    item,
    ...inspectMediaFile(
      item.file,
      item.kind === "logo" ? MAX_BRAND_LOGO_BYTES : MAX_BRAND_FONT_BYTES,
    ),
  }))
  if (
    inspected.reduce((total, item) => total + item.fileSize, 0) >
    MAX_BRAND_BATCH_BYTES
  ) {
    throw new CliMediaUploadError("file_too_large")
  }
  const results: Array<Record<string, unknown>> = []
  for (let index = 0; index < inspected.length; index += 1) {
    const entry = inspected[index]!
    if (input.signal.aborted) {
      appendCancelledItems({ inspected, results, startIndex: index })
      break
    }
    try {
      const uploaded = await uploadOneBrandFile({ ...input, item: entry.item })
      results.push({
        ...uploaded,
        kind: entry.item.kind,
        label: entry.item.label,
        originalFilename: entry.originalFilename,
        requestId: entry.item.requestId,
      })
    } catch (error) {
      if (input.signal.aborted) {
        results.push({
          code: "execution_uncertain",
          ok: false,
          requestId: entry.item.requestId,
        })
        appendCancelledItems({ inspected, results, startIndex: index + 1 })
        break
      }
      results.push({
        code: safeItemErrorCode(error),
        ok: false,
        requestId: entry.item.requestId,
      })
    }
  }
  const failedCount = results.filter((result) => result.ok === false).length
  return {
    failedCount,
    ok: failedCount === 0,
    results,
    uploadedCount: results.length - failedCount,
  }
}
