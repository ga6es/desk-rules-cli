/**
 * CLI URL safety boundary shared by doctor and config repair.
 * Keep credential, query, fragment, protocol, and local-HTTP acceptance here so
 * neither consumer can silently weaken the other's no-secret/no-probe policy.
 */
export function parseSafeMcpUrl(
  value: string,
  options: { allowLocalHttp?: boolean } = {},
) {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash) return null
    if (url.protocol === "https:") return url
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    return options.allowLocalHttp && local && url.protocol === "http:"
      ? url
      : null
  } catch {
    return null
  }
}
