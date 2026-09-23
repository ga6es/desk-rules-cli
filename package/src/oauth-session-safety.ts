import type { OAuthDiscoveryState } from "@modelcontextprotocol/client"
import { isUnsafeDiscoveryHostname } from "./oauth-metadata.js"

function isLoopback(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1"
}

/** The explicit local endpoint is the only opt-in to local OAuth services. */
export function assertSafeOAuthUrl(value: string | URL, endpoint: string, allowQuery = false) {
  const url = new URL(value)
  const local = isLoopback(new URL(endpoint)) && isLoopback(url)
  if (
    url.username || url.password || url.hash || (!allowQuery && url.search) ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    (!local && isUnsafeDiscoveryHostname(url.hostname))
  ) throw new Error("unsafe_oauth_url")
  return url
}

export function assertSafeDiscoveryState(state: OAuthDiscoveryState, endpoint: string) {
  const issuer = assertSafeOAuthUrl(state.authorizationServerUrl, endpoint)
  const metadata = state.authorizationServerMetadata
  if (metadata && new URL(metadata.issuer).toString() !== issuer.toString()) {
    throw new Error("oauth_issuer_mismatch")
  }
  if (state.resourceMetadataUrl) assertSafeOAuthUrl(state.resourceMetadataUrl, endpoint)
  for (const value of state.resourceMetadata?.authorization_servers ?? []) {
    if (assertSafeOAuthUrl(value, endpoint).toString() !== issuer.toString()) {
      throw new Error("oauth_issuer_mismatch")
    }
  }
  for (const value of [metadata?.authorization_endpoint, metadata?.token_endpoint, metadata?.registration_endpoint]) {
    if (value) assertSafeOAuthUrl(value, endpoint)
  }
}
