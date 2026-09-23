import { createHash, randomBytes } from "node:crypto"
import {
  constants,
  link,
  open,
  rename,
  stat,
  unlink,
} from "node:fs/promises"
import { basename, dirname, extname, join, resolve } from "node:path"
import type { CallToolResult } from "@modelcontextprotocol/client"

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_IMAGES = 8
const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

export class CliImageFileError extends Error {
  constructor(
    readonly code:
      | "image_output_conflict"
      | "image_output_invalid"
      | "image_output_partial"
      | "image_output_unavailable"
      | "image_payload_invalid",
    readonly createdOutputPaths: readonly string[] = [],
  ) {
    super(code)
    this.name = "CliImageFileError"
  }
}

type DecodedImage = {
  bytes: Buffer
  extension: ".jpg" | ".png" | ".webp"
  height: number
  mimeType: "image/jpeg" | "image/png" | "image/webp"
  sha256: string
  width: number
}

type ToolImageContent = Extract<
  CallToolResult["content"][number],
  { type: "image" }
>

function readPngDimensions(bytes: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const endChunk = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
  if (
    bytes.byteLength < 45 ||
    !bytes.subarray(0, signature.byteLength).equals(signature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    !bytes.subarray(-endChunk.byteLength).equals(endChunk)
  ) {
    throw new CliImageFileError("image_payload_invalid")
  }
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) }
}

function assertJpegEnvelope(bytes: Buffer) {
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    throw new CliImageFileError("image_payload_invalid")
  }
}

function readJpegDimensions(bytes: Buffer) {
  assertJpegEnvelope(bytes)
  let offset = 2
  while (offset + 8 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1] ?? 0
    offset += 2
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue
    if (offset + 2 > bytes.byteLength) break
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.byteLength) break
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (length < 7) break
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      }
    }
    offset += length
  }
  throw new CliImageFileError("image_payload_invalid")
}

function readWebpEnvelope(bytes: Buffer) {
  if (
    bytes.byteLength < 20 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP" ||
    bytes.readUInt32LE(4) !== bytes.byteLength - 8
  ) {
    throw new CliImageFileError("image_payload_invalid")
  }
  const kind = bytes.toString("ascii", 12, 16)
  const chunkSize = bytes.readUInt32LE(16)
  const paddedChunkSize = chunkSize + (chunkSize % 2)
  if (20 + paddedChunkSize > bytes.byteLength) {
    throw new CliImageFileError("image_payload_invalid")
  }
  return { chunkSize, kind }
}

function readExtendedWebpDimensions(bytes: Buffer, chunkSize: number) {
  if (chunkSize < 10) {
    throw new CliImageFileError("image_payload_invalid")
  }
  return {
    height: 1 + bytes.readUIntLE(27, 3),
    width: 1 + bytes.readUIntLE(24, 3),
  }
}

function readLossyWebpDimensions(bytes: Buffer, chunkSize: number) {
  if (
    chunkSize < 10 ||
    bytes[23] !== 0x9d ||
    bytes[24] !== 0x01 ||
    bytes[25] !== 0x2a
  ) {
    throw new CliImageFileError("image_payload_invalid")
  }
  return {
    height: bytes.readUInt16LE(28) & 0x3fff,
    width: bytes.readUInt16LE(26) & 0x3fff,
  }
}

function readLosslessWebpDimensions(bytes: Buffer, chunkSize: number) {
  if (chunkSize < 5 || bytes[20] !== 0x2f) {
    throw new CliImageFileError("image_payload_invalid")
  }
  const packed = bytes.readUInt32LE(21)
  return {
    height: 1 + ((packed >> 14) & 0x3fff),
    width: 1 + (packed & 0x3fff),
  }
}

function readWebpDimensions(bytes: Buffer) {
  const { chunkSize, kind } = readWebpEnvelope(bytes)
  if (kind === "VP8X") return readExtendedWebpDimensions(bytes, chunkSize)
  if (kind === "VP8 ") return readLossyWebpDimensions(bytes, chunkSize)
  if (kind === "VP8L") return readLosslessWebpDimensions(bytes, chunkSize)
  throw new CliImageFileError("image_payload_invalid")
}

function decodeCanonicalBase64(data: string) {
  const maxBase64Length = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4
  if (data.length === 0 || data.length > maxBase64Length || data.length % 4 !== 0) {
    throw new CliImageFileError("image_payload_invalid")
  }
  if (/[^A-Za-z0-9+/=]/u.test(data)) {
    throw new CliImageFileError("image_payload_invalid")
  }
  const paddingStart = data.indexOf("=")
  if (paddingStart !== -1) {
    const paddingLength = data.length - paddingStart
    if (paddingLength > 2 || data.slice(paddingStart) !== "=".repeat(paddingLength)) {
      throw new CliImageFileError("image_payload_invalid")
    }
  }
  const bytes = Buffer.from(data, "base64")
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== data
  ) {
    throw new CliImageFileError("image_payload_invalid")
  }
  return bytes
}

function readImageFormat(
  bytes: Buffer,
  mimeType: string,
): {
  dimensions: { height: number; width: number }
  mimeType: DecodedImage["mimeType"]
} {
  const rawType = mimeType.toLowerCase()
  if (rawType === "image/jpeg") {
    return { dimensions: readJpegDimensions(bytes), mimeType: rawType }
  }
  if (rawType === "image/png") {
    return { dimensions: readPngDimensions(bytes), mimeType: rawType }
  }
  if (rawType === "image/webp") {
    return { dimensions: readWebpDimensions(bytes), mimeType: rawType }
  }
  throw new CliImageFileError("image_payload_invalid")
}

function decodeImage(data: string, mimeType: string): DecodedImage {
  const bytes = decodeCanonicalBase64(data)
  const format = readImageFormat(bytes, mimeType)
  const { dimensions } = format
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw new CliImageFileError("image_payload_invalid")
  }
  return {
    bytes,
    extension:
      format.mimeType === "image/jpeg"
        ? ".jpg"
        : format.mimeType === "image/png"
          ? ".png"
          : ".webp",
    height: dimensions.height,
    mimeType: format.mimeType,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    width: dimensions.width,
  }
}

function readImages(result: CallToolResult) {
  const images = result.content
    .filter((item): item is ToolImageContent => item.type === "image")
  if (images.length < 1 || images.length > MAX_IMAGES) {
    throw new CliImageFileError("image_output_unavailable")
  }
  return images.map((item) => decodeImage(item.data, item.mimeType))
}

async function requireOutputDirectory(path: string) {
  const target = resolve(path)
  const metadata = await stat(target).catch(() => null)
  if (!metadata?.isDirectory()) {
    throw new CliImageFileError("image_output_invalid")
  }
  return target
}

function assertFileExtension(path: string, image: DecodedImage) {
  const extension = extname(path).toLowerCase()
  const allowed =
    image.extension === ".jpg"
      ? [".jpg", ".jpeg"]
      : image.extension === ".png"
        ? [".png"]
        : [".webp"]
  if (!allowed.includes(extension) || basename(path).length > 240) {
    throw new CliImageFileError("image_output_invalid")
  }
}

async function publishImage(input: {
  image: DecodedImage
  overwrite: boolean
  signal: AbortSignal
  targetPath: string
}) {
  input.signal.throwIfAborted()
  const targetPath = resolve(input.targetPath)
  assertFileExtension(targetPath, input.image)
  await requireOutputDirectory(dirname(targetPath))
  const tempPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.${randomBytes(8).toString("hex")}.tmp`,
  )
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    await handle.writeFile(input.image.bytes)
    await handle.sync()
    await handle.close()
    handle = null
    input.signal.throwIfAborted()
    if (input.overwrite) {
      await rename(tempPath, targetPath)
    } else {
      await link(tempPath, targetPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") {
          throw new CliImageFileError("image_output_conflict")
        }
        throw error
      })
      await unlink(tempPath)
    }
    return targetPath
  } finally {
    await handle?.close().catch(() => undefined)
    await unlink(tempPath).catch(() => undefined)
  }
}

export async function saveToolResultImages(input: {
  outputDirectory: string | null
  outputFile: string | null
  overwrite: boolean
  result: CallToolResult
  signal: AbortSignal
}) {
  if (Boolean(input.outputDirectory) === Boolean(input.outputFile)) {
    throw new CliImageFileError("image_output_invalid")
  }
  const images = readImages(input.result)
  if (input.outputFile && images.length !== 1) {
    throw new CliImageFileError("image_output_invalid")
  }
  if (input.outputDirectory && input.overwrite) {
    throw new CliImageFileError("image_output_invalid")
  }
  const outputDirectory = input.outputDirectory
    ? await requireOutputDirectory(input.outputDirectory)
    : null
  const targets = images.map((image, index) =>
    input.outputFile ?? join(outputDirectory!, `preview-${String(index + 1).padStart(2, "0")}${image.extension}`),
  )
  if (outputDirectory) {
    const existing = await Promise.all(targets.map((target) => stat(target).catch(() => null)))
    if (existing.some(Boolean)) {
      throw new CliImageFileError("image_output_conflict")
    }
  }
  const saved: Record<string, unknown>[] = []
  try {
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]!
      const outputPath = await publishImage({
        image,
        overwrite: input.overwrite,
        signal: input.signal,
        targetPath: targets[index]!,
      })
      saved.push({
        byteSize: image.bytes.byteLength,
        height: image.height,
        mimeType: image.mimeType,
        outputPath,
        sha256: image.sha256,
        width: image.width,
      })
    }
    return saved
  } catch (error) {
    if (saved.length > 0) {
      throw new CliImageFileError(
        "image_output_partial",
        saved.map((item) => String(item.outputPath)),
      )
    }
    throw error
  }
}
