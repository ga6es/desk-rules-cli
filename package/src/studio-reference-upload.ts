import type { CallToolResult, Client } from "@modelcontextprotocol/client"

import {
  executeRegisteredToolRaw,
  OperationalMcpError,
  sanitizeMachineValue,
} from "./operational-mcp.js"
import type { ProtectedOAuthProvider } from "./oauth-session.js"
import {
  hashMediaFile,
  inspectMediaFile,
  streamPreparedFile,
} from "./media-upload.js"

const MAX_REFERENCE_BYTES = 20 * 1024 * 1024
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readPreparedStudioTransfer(result: CallToolResult) {
  if (result.isError || !isRecord(result.structuredContent)) {
    throw new OperationalMcpError("execution_failed")
  }
  const envelope = result.structuredContent
  const value = isRecord(envelope.result) ? envelope.result : envelope
  if (envelope.ok === false || value.status !== "awaiting_bytes") {
    throw new OperationalMcpError("execution_failed")
  }
  if (
    typeof value.uploadPath !== "string" ||
    !/^\/api\/mcp\/studio-references\/[A-Za-z0-9_-]{40,8192}$/u.test(
      value.uploadPath,
    )
  ) {
    throw new OperationalMcpError("capability_mismatch")
  }
  return value.uploadPath
}

export async function uploadStudioReference(input: {
  approveWrite: boolean
  client: Client
  endpoint: string
  filePath: string | null
  provider: ProtectedOAuthProvider
  requestId: string | null
  signal: AbortSignal
}) {
  if (!input.filePath || !input.requestId || !UUID_PATTERN.test(input.requestId)) {
    throw new OperationalMcpError("input_invalid")
  }
  const inspected = inspectMediaFile(input.filePath, MAX_REFERENCE_BYTES)
  input.signal.throwIfAborted()
  const contentHash = await hashMediaFile(input.filePath, input.signal)
  const { result } = await executeRegisteredToolRaw({
    approvals: { external: false, write: input.approveWrite },
    arguments: {
      contentHash,
      fileSize: inspected.fileSize,
      originalFilename: inspected.originalFilename,
      requestId: input.requestId,
    },
    client: input.client,
    signal: input.signal,
    toolName: "prepare_studio_generation_reference_upload",
  })
  const uploadPath = readPreparedStudioTransfer(result)
  const uploaded = await streamPreparedFile({
    accessToken: input.provider.accessToken(),
    endpoint: input.endpoint,
    filePath: input.filePath,
    fileSize: inspected.fileSize,
    requestId: input.requestId,
    signal: input.signal,
    uploadPath,
  })
  if (!uploaded.ok) return uploaded
  return {
    ok: true,
    requestId: input.requestId,
    result: sanitizeMachineValue(uploaded.value),
  }
}
