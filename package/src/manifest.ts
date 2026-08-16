/**
 * Distribution snapshot:
 * The CLI package cannot import application source. Contract checks require
 * this snapshot to match the canonical manifest in lib/content.
 */
export const DESK_RULES_MCP_SERVER_MANIFEST = {
  canonicalEndpoint: "https://agents.deskrules.com/api/mcp",
  canonicalScripts: {
    smoke: "desk-rules:mcp:smoke",
    stdio: "desk-rules:mcp:stdio",
  },
  cli: {
    binaryName: "deskrules",
    npmPackageName: "@desk-rules/cli",
    npmPackageStatus: "published",
    npmPersistentInstallCommand: "npm install -g @desk-rules/cli",
    npmRunCommand: "npm exec @desk-rules/cli@latest --",
    preparedVersion: "0.1.10",
    publishedVersion: "0.1.9",
    standaloneBinaryStatus: "planned",
  },
  compatibility: {
    minimumCliVersion: "0.1.6",
    minimumPluginVersion: "0.1.8",
    minimumSkillsVersion: "0.1.8",
    reconnectPolicy: {
      capabilityChange:
        "Restart or reconnect the MCP client, or begin a new agent task, so it rediscovers the current tool manifest. OAuth reauthorization is not normally required.",
      endpointChange:
        "Reconnect the MCP client after replacing a legacy endpoint. The client may require OAuth authentication for the canonical endpoint.",
      permissionInvariant:
        "Tool discovery never grants write access. Desk Rules master access, manifest-owned workflow permissions, billing, ownership, provider requirements, and the client approval mode still govern mutations.",
    },
    updateContract:
      "CLI, plugins, skills, docs, smoke tests, and Account UI consume this manifest instead of inventing separate MCP capability language.",
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
  clientProfiles: {
    default: {
      description:
        "Discover every registered Desk Rules MCP tool and rely on server authorization plus client approval settings for writes.",
      id: "full",
      toolDiscovery: "all_registered",
    },
    starter: {
      description:
        "Explicitly restrict discovery to the manifest-generated starter tool set.",
      id: "starter",
      toolDiscovery: "starter_profile",
    },
  },
  legacyEndpoints: [
    {
      canonical: "https://agents.deskrules.com/api/mcp",
      endpoint: "https://desk-rules-mcp-production.up.railway.app/api/mcp",
      status: "temporary",
    },
    {
      canonical: "https://agents.deskrules.com/api/mcp",
      endpoint: "https://desk-rules-production.up.railway.app/api/mcp",
      status: "temporary",
    },
  ],
  legacyAliases: [
    {
      alias: "create-from-story:mcp:stdio",
      canonical: "desk-rules:mcp:stdio",
      kind: "npm_script",
      status: "temporary",
    },
    {
      alias: "create-from-story:mcp:smoke",
      canonical: "desk-rules:mcp:smoke",
      kind: "npm_script",
      status: "temporary",
    },
    {
      alias: "desk-rules-create-from-story",
      canonical: "desk-rules-mcp",
      kind: "client_config_name",
      status: "temporary",
    },
    {
      alias: "desk-rules-create-from-story-remote",
      canonical: "desk-rules-mcp",
      kind: "client_config_name",
      status: "temporary",
    },
  ],
  recoveryPaths: {
    accountAccess: "/account/agent",
    billing: "/account/billing",
    pricing: "/pricing",
    providerConnections: "/account/apps",
  },
  manifestVersion: "2026-08-15.research-workflows-v1",
  plugin: {
    codexMarketplaceStatus: "private-preview",
    packageName: "desk-rules-mcp",
  },
  productName: "Desk Rules MCP",
  serverName: "desk-rules-mcp",
} as const

export const DESK_RULES_MCP_READ_FIRST_TOOL_NAMES = [
  "inspect_mcp_authorization_status",
  "inspect_rules",
  "inspect_editor_capability_map",
  "inspect_mcp_tool_examples",
  "list_recent_designs",
  "inspect_design_metadata",
  "inspect_design_document",
  "inspect_design_page",
] as const

export const DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES = [
  "inspect_mcp_authorization_status",
  "inspect_rules",
  "inspect_editor_capability_map",
  "inspect_mcp_tool_examples",
  "inspect_news_board_source_catalog",
  "inspect_news_board_follows",
  "follow_news_board_target",
  "unfollow_news_board_target",
  "inspect_news_board_lists",
  "create_news_board_list",
  "update_news_board_list",
  "delete_news_board_list",
  "add_news_board_list_source",
  "remove_news_board_list_source",
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
  "inspect_editor_templates",
  "inspect_editor_template_detail",
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
  "create_from_story_on_page",
  "create_design_export",
  "publish_design",
] as const

export const DESK_RULES_MCP_REQUIRED_NEWS_BOARD_WORKFLOW_TOOL_NAMES = [
  "inspect_news_board_source_catalog",
  "inspect_news_board_follows",
  "follow_news_board_target",
  "unfollow_news_board_target",
  "inspect_news_board_lists",
  "create_news_board_list",
  "update_news_board_list",
  "delete_news_board_list",
  "add_news_board_list_source",
  "remove_news_board_list_source",
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
] as const
