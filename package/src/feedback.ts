import { createHash } from "node:crypto"
import { lstatSync, readFileSync } from "node:fs"
import path from "node:path"

import type { CallToolResult, Client } from "@modelcontextprotocol/client"

import type { ProtectedOAuthProvider } from "./oauth-session.js"
import {
  executeRegisteredToolRaw,
  OperationalMcpError,
  sanitizeMachineValue,
} from "./operational-mcp.js"
import {
  CliMediaUploadError,
  hashMediaFile,
  inspectMediaFile,
  readPreparedTransfer,
  streamPreparedFile,
} from "./media-upload.js"

const MAX_REPORT_BYTES = 64 * 1024
const MAX_BATCH_FILE_BYTES = 1024 * 1024
const MAX_ATTACHMENTS = 8
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024
const MAX_TEXT_BYTES = 64 * 1024
const MAX_AGGREGATE_BYTES = 16 * 1024 * 1024
const MAX_ORIGINAL_FILENAME_LENGTH = 160
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type FeedbackAttachment = {
  contentHash: string
  contentType: "image/jpeg" | "image/png" | "image/webp" | "text/plain"
  evidenceKind: "screenshot" | "text"
  file: string
  fileSize: number
  originalFilename: string
  requestId: string
}

export type FeedbackSubmitInput = {
  attachmentFile: string | null
  attachmentsFile: string | null
  pathname: string | null
  reportFile: string | null
  requestId: string | null
  summary: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readBoundedUtf8File(filePath: string, maxBytes: number) {
  try {
    const stats = lstatSync(filePath)
    if (!stats.isFile() || stats.size < 1 || stats.size > maxBytes) {
      throw new Error("invalid file")
    }
    const buffer = readFileSync(filePath)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer)
    if (!text.trim()) throw new Error("empty file")
    return text
  } catch {
    throw new CliMediaUploadError("file_invalid")
  }
}

function deterministicAttachmentRequestId(input: {
  contentHash: string
  originalFilename: string
  submissionKey: string
}) {
  const hex = createHash("sha256")
    .update(
      `${input.submissionKey}\0${input.originalFilename}\0${input.contentHash}`,
    )
    .digest("hex")
    .slice(0, 32)
    .split("")
  hex[12] = "5"
  const variant = Number.parseInt(hex[16]!, 16)
  hex[16] = ((variant & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`
}

function contentTypeFromFilename(filename: string) {
  const extension = path.extname(filename).toLowerCase()
  const values = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".txt": "text/plain",
    ".webp": "image/webp",
  } as const
  return values[extension as keyof typeof values] ?? null
}

function readAttachmentPaths(input: FeedbackSubmitInput) {
  if (input.attachmentFile && input.attachmentsFile) {
    throw new CliMediaUploadError("batch_invalid")
  }
  if (input.attachmentFile)
    return [{ file: input.attachmentFile, requestId: null }]
  if (!input.attachmentsFile) return []
  let parsed: unknown
  try {
    const stats = lstatSync(input.attachmentsFile)
    if (!stats.isFile() || stats.size > MAX_BATCH_FILE_BYTES)
      throw new Error("invalid")
    parsed = JSON.parse(readFileSync(input.attachmentsFile, "utf8"))
  } catch {
    throw new CliMediaUploadError("batch_invalid")
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > MAX_ATTACHMENTS
  ) {
    throw new CliMediaUploadError("batch_invalid")
  }
  return parsed.map((value) => {
    if (typeof value === "string" && value.trim()) {
      return { file: value, requestId: null }
    }
    if (
      isRecord(value) &&
      typeof value.file === "string" &&
      value.file.trim() &&
      (value.requestId === undefined ||
        (typeof value.requestId === "string" &&
          UUID_PATTERN.test(value.requestId)))
    ) {
      return {
        file: value.file,
        requestId: typeof value.requestId === "string" ? value.requestId : null,
      }
    }
    throw new CliMediaUploadError("batch_invalid")
  })
}

async function inspectAttachment(input: {
  file: string
  requestId: string | null
  signal: AbortSignal
  submissionKey: string
}): Promise<FeedbackAttachment> {
  const originalFilename = path.basename(input.file)
  const contentType = contentTypeFromFilename(originalFilename)
  if (!contentType) throw new CliMediaUploadError("file_invalid")
  const evidenceKind = contentType === "text/plain" ? "text" : "screenshot"
  const maxBytes =
    evidenceKind === "text" ? MAX_TEXT_BYTES : MAX_SCREENSHOT_BYTES
  const inspected = inspectMediaFile(input.file, maxBytes)
  if (inspected.originalFilename.length > MAX_ORIGINAL_FILENAME_LENGTH) {
    throw new CliMediaUploadError("file_invalid")
  }
  const contentHash = await hashMediaFile(input.file, input.signal)
  return {
    contentHash,
    contentType,
    evidenceKind,
    file: input.file,
    fileSize: inspected.fileSize,
    originalFilename: inspected.originalFilename,
    requestId:
      input.requestId ??
      deterministicAttachmentRequestId({
        contentHash,
        originalFilename: inspected.originalFilename,
        submissionKey: input.submissionKey,
      }),
  }
}

export async function readFeedbackSubmission(
  input: FeedbackSubmitInput & {
    signal: AbortSignal
  },
) {
  if (
    !input.reportFile ||
    !input.summary ||
    !input.requestId ||
    !UUID_PATTERN.test(input.requestId)
  ) {
    throw new OperationalMcpError("input_invalid")
  }
  const summary = input.summary.trim().replace(/\s+/g, " ")
  if (summary.length < 10 || summary.length > 240) {
    throw new OperationalMcpError("input_invalid")
  }
  const fullReport = readBoundedUtf8File(input.reportFile, MAX_REPORT_BYTES)
  const attachmentPaths = readAttachmentPaths(input)
  const attachments = await Promise.all(
    attachmentPaths.map((attachment) =>
      inspectAttachment({
        ...attachment,
        signal: input.signal,
        submissionKey: input.requestId!,
      }),
    ),
  )
  if (
    new Set(attachments.map((attachment) => attachment.requestId)).size !==
      attachments.length ||
    attachments.reduce((total, attachment) => total + attachment.fileSize, 0) >
      MAX_AGGREGATE_BYTES
  ) {
    throw new CliMediaUploadError("batch_invalid")
  }
  return {
    attachments,
    submission: {
      attachmentManifest: attachments.map(
        ({ file: _file, ...attachment }) => attachment,
      ),
      clientSubmissionKey: input.requestId,
      contractVersion: 2 as const,
      fullReport,
      pathname: input.pathname ?? "/",
      reproduction: {},
      summary,
    },
  }
}

function readStructuredResult(result: CallToolResult) {
  if (result.isError || !isRecord(result.structuredContent)) {
    throw new OperationalMcpError("execution_failed")
  }
  return sanitizeMachineValue(result.structuredContent) as Record<
    string,
    unknown
  >
}

export async function submitFeedback(input: {
  approveWrite: boolean
  client: Client
  endpoint: string
  prepared: Awaited<ReturnType<typeof readFeedbackSubmission>>
  provider: ProtectedOAuthProvider
  signal: AbortSignal
}) {
  const attachmentResults: Array<Record<string, unknown>> = []
  for (const attachment of input.prepared.attachments) {
    const { result } = await executeRegisteredToolRaw({
      approvals: { external: false, write: input.approveWrite },
      arguments: {
        ...input.prepared.submission,
        requestId: attachment.requestId,
      },
      client: input.client,
      signal: input.signal,
      toolName: "prepare_workspace_feedback_attachment_upload",
    })
    const preparedTransfer = readPreparedTransfer(
      result,
      "/api/mcp/feedback-evidence",
    )
    const uploaded = preparedTransfer.readyResult
      ? { ok: true as const, value: preparedTransfer.readyResult }
      : await streamPreparedFile({
          accessToken: input.provider.accessToken(),
          endpoint: input.endpoint,
          filePath: attachment.file,
          fileSize: attachment.fileSize,
          requestId: attachment.requestId,
          signal: input.signal,
          uploadPath: preparedTransfer.uploadPath!,
        })
    const uploadedValue =
      uploaded.ok && isRecord(uploaded.value) ? uploaded.value : uploaded
    attachmentResults.push({
      ...uploadedValue,
      ok: uploaded.ok,
      originalFilename: attachment.originalFilename,
      requestId: attachment.requestId,
    })
    if (!uploaded.ok) {
      return {
        attachmentResults,
        ok: false as const,
        submissionState: "draft" as const,
      }
    }
  }
  const { result } = await executeRegisteredToolRaw({
    approvals: { external: false, write: input.approveWrite },
    arguments: input.prepared.submission,
    client: input.client,
    signal: input.signal,
    toolName: "submit_workspace_feedback",
  })
  const submissionResult = readStructuredResult(result)
  return {
    attachmentResults,
    ...submissionResult,
  }
}

export async function inspectFeedbackStatus(input: {
  client: Client
  clientSubmissionKey: string | null
  reportId: string | null
  signal: AbortSignal
}) {
  if (
    Boolean(input.clientSubmissionKey) === Boolean(input.reportId) ||
    (input.clientSubmissionKey &&
      !UUID_PATTERN.test(input.clientSubmissionKey)) ||
    (input.reportId && !UUID_PATTERN.test(input.reportId))
  ) {
    throw new OperationalMcpError("input_invalid")
  }
  const { result } = await executeRegisteredToolRaw({
    approvals: { external: false, write: false },
    arguments: input.reportId
      ? { reportId: input.reportId }
      : { clientSubmissionKey: input.clientSubmissionKey },
    client: input.client,
    signal: input.signal,
    toolName: "inspect_workspace_feedback_status",
  })
  return readStructuredResult(result)
}
