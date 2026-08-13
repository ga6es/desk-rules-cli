const PRIVATE_IPV4_PATTERN =
  /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/

/**
 * OAuth discovery safety boundary:
 * Normalize discovery hosts before rejecting local/private endpoints, including
 * trailing-dot, bracketed IPv6, and IPv4-mapped forms.
 */
function normalizeUrlHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  const bracketed = normalized.match(/^\[(.*)\]$/)
  return bracketed?.[1] ?? normalized
}

function isPrivateIpv6Host(hostname: string) {
  if (hostname === "::" || hostname === "::1") return true
  if (hostname.startsWith("::ffff:")) {
    return true
  }
  const firstHextet = hostname.split(":")[0]
  const first = Number.parseInt(firstHextet, 16)
  if (!Number.isFinite(first)) return false
  const isUniqueLocal = (first & 0xfe00) === 0xfc00
  const isLinkLocal = (first & 0xffc0) === 0xfe80
  return isUniqueLocal || isLinkLocal
}

function isUnsafeDiscoveryHostname(hostname: string) {
  const normalized = normalizeUrlHostname(hostname)
  return (
    normalized === "localhost" ||
    PRIVATE_IPV4_PATTERN.test(normalized) ||
    isPrivateIpv6Host(normalized)
  )
}

export type OAuthRegistrationMode =
  | "client_id_metadata_document"
  | "dynamic_client_registration"
  | "manual"

export type OAuthMetadataInspection = {
  authorizationServer: string
  clientRegistrationMode: OAuthRegistrationMode
  issuerMatches: boolean
  metadataHttpStatus: number
  metadataUrl: string
  pkceS256Supported: boolean
}

function assertSafeAuthorizationServer(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Protected-resource metadata has no authorization server.")
  }

  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    isUnsafeDiscoveryHostname(url.hostname)
  ) {
    throw new Error(
      "Authorization-server metadata URL is not safe for remote discovery.",
    )
  }
  return url
}

export function createAuthorizationServerMetadataUrl(
  authorizationServer: string,
) {
  const issuer = assertSafeAuthorizationServer(authorizationServer)
  return new URL(
    `/.well-known/oauth-authorization-server${issuer.pathname}`,
    issuer.origin,
  ).toString()
}

export async function inspectAuthorizationServerMetadata(input: {
  authorizationServers: unknown
  fetchJson: (
    url: string,
  ) => Promise<{ json: unknown; response: { ok: boolean; status: number } }>
}) {
  if (
    !Array.isArray(input.authorizationServers) ||
    input.authorizationServers.length !== 1
  ) {
    throw new Error(
      "Protected-resource metadata must identify one authorization server.",
    )
  }

  const authorizationServer = assertSafeAuthorizationServer(
    input.authorizationServers[0],
  ).toString()
  const metadataUrl = createAuthorizationServerMetadataUrl(authorizationServer)
  const { json, response } = await input.fetchJson(metadataUrl)
  const metadata =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {}
  const codeChallengeMethods = Array.isArray(
    metadata.code_challenge_methods_supported,
  )
    ? metadata.code_challenge_methods_supported
    : []
  const clientRegistrationMode: OAuthRegistrationMode =
    metadata.client_id_metadata_document_supported === true
      ? "client_id_metadata_document"
      : typeof metadata.registration_endpoint === "string"
        ? "dynamic_client_registration"
        : "manual"

  return {
    authorizationServer,
    clientRegistrationMode,
    issuerMatches: metadata.issuer === authorizationServer,
    metadataHttpStatus: response.status,
    metadataUrl,
    pkceS256Supported: codeChallengeMethods.includes("S256"),
  } satisfies OAuthMetadataInspection
}
