/**
 * Public compatibility contract shared by the application and CLI package.
 * Keep this module dependency-free so the public CLI export can consume it
 * without importing application source.
 */
export const DESK_RULES_PUBLIC_COMPATIBILITY = {
  canonicalEndpoint: "https://agents.deskrules.com/api/mcp",
  clientProfiles: {
    default: {
      description:
        "Use the manifest-generated starter tool set for common Desk Rules workflows.",
      id: "starter",
      toolDiscovery: "starter_profile",
    },
    full: {
      description: "Explicitly discover every registered Desk Rules MCP tool.",
      id: "full",
      toolDiscovery: "all_registered",
    },
  },
  compatibilityText: {
    reconnectPolicy: {
      capabilityChange:
        "Restart or reconnect the MCP client, or begin a new agent task, so it rediscovers the current tool manifest. OAuth reauthorization is not normally required.",
      endpointChange:
        "Reconnect the MCP client after changing the endpoint. The client may require OAuth authentication for the canonical endpoint.",
      permissionInvariant:
        "Tool discovery never grants write access. Desk Rules access, workflow permissions, billing, ownership, provider requirements, and client approval still govern mutations.",
    },
    updateContract:
      "CLI, plugins, skills, docs, smoke tests, and Account UI consume the public compatibility contract instead of inventing release metadata.",
  },
  manifestVersion: "2026-08-17.story-fingerprint-copy-id-v1",
  profiles: {
    starterTools: [
      "inspect_mcp_authorization_status",
      "inspect_rules",
      "inspect_news_board_source_catalog",
      "inspect_news_board_story_targets",
      "inspect_news_board_story",
      "inspect_news_board_story_research",
      "validate_news_board_story_research_section",
      "inspect_news_board_saved_research_history",
      "inspect_news_board_saved_research_item",
      "save_news_board_story_research",
      "save_news_board_story_research_section",
      "inspect_template_candidates",
      "inspect_template_fields",
      "prepare_template_autofill",
      "create_design_from_story_research",
      "prepare_editor_action_context",
      "list_recent_designs",
      "search_user_designs",
      "inspect_design_metadata",
      "inspect_design_document",
      "inspect_design_page",
      "inspect_design_page_preview",
      "inspect_uploaded_assets",
      "inspect_brand_kit",
      "inspect_export_options",
      "prepare_design_export",
      "inspect_publish_targets",
      "prepare_publish",
      "start_agent_draft",
      "apply_actions_to_draft",
      "preview_agent_draft_page",
      "commit_agent_draft",
      "discard_agent_draft",
      "create_design_export",
      "publish_design",
    ],
  },
  protocolCompatibility: {
    cache: {
      methods: ["server/discover", "tools/list"],
      scope: "public",
      ttlMs: 300000,
    },
    legacy: {
      mode: "stateless",
      protocolVersion: "2025-11-25",
      status: "supported",
    },
    modern: {
      discoveryMethod: "server/discover",
      protocolVersion: "2026-07-28",
      status: "supported",
    },
    multiRoundTrip: {
      eligibleInteractions: ["news_board_story_target_clarification"],
      maxRounds: 2,
      status: "supported",
      unsupportedClientFallback: "bounded_tool_result",
    },
    negotiation: "automatic",
    routing: {
      bodyAuthoritative: true,
      headers: ["Mcp-Method", "Mcp-Name"],
      mismatchBehavior: "reject",
    },
    tasks: {
      advertised: false,
      extension: "io.modelcontextprotocol/tasks",
      status: "deferred",
    },
  },
  serverName: "desk-rules-mcp",
  versions: {
    cli: {
      current: "0.2.1",
      minimumCompatible: "0.2.1",
      published: "0.2.0",
    },
    plugin: {
      current: "0.2.1",
      minimumCompatible: "0.2.1",
    },
    skills: {
      current: "0.2.1",
      minimumCompatible: "0.2.1",
    },
  },
} as const

export function isDeskRulesPublicCliSetupAvailable(input: {
  currentVersion: string
  publishedVersion: string
}) {
  return input.currentVersion === input.publishedVersion
}
