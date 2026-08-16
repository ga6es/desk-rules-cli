import { DESK_RULES_PUBLIC_COMPATIBILITY } from "./public-compatibility.js"

/**
 * Runtime-neutral CLI metadata. Public compatibility literals come from the
 * dependency-free contract shared with the application.
 */
export const DESK_RULES_MCP_SERVER_MANIFEST = {
  canonicalEndpoint: DESK_RULES_PUBLIC_COMPATIBILITY.canonicalEndpoint,
  cli: {
    binaryName: "deskrules",
    currentVersion: DESK_RULES_PUBLIC_COMPATIBILITY.versions.cli.current,
    npmPackageName: "@desk-rules/cli",
    npmPackageStatus: "published",
    npmPersistentInstallCommand: "npm install -g @desk-rules/cli",
    npmRunCommand: "npm exec @desk-rules/cli@latest --",
    preparedVersion: DESK_RULES_PUBLIC_COMPATIBILITY.versions.cli.current,
    publishedVersion: DESK_RULES_PUBLIC_COMPATIBILITY.versions.cli.published,
    standaloneBinaryStatus: "planned",
  },
  compatibility: {
    currentPluginVersion:
      DESK_RULES_PUBLIC_COMPATIBILITY.versions.plugin.current,
    currentSkillsVersion:
      DESK_RULES_PUBLIC_COMPATIBILITY.versions.skills.current,
    minimumCliVersion:
      DESK_RULES_PUBLIC_COMPATIBILITY.versions.cli.minimumCompatible,
    minimumPluginVersion:
      DESK_RULES_PUBLIC_COMPATIBILITY.versions.plugin.minimumCompatible,
    minimumSkillsVersion:
      DESK_RULES_PUBLIC_COMPATIBILITY.versions.skills.minimumCompatible,
    reconnectPolicy:
      DESK_RULES_PUBLIC_COMPATIBILITY.compatibilityText.reconnectPolicy,
    updateContract:
      DESK_RULES_PUBLIC_COMPATIBILITY.compatibilityText.updateContract,
  },
  protocolCompatibility: DESK_RULES_PUBLIC_COMPATIBILITY.protocolCompatibility,
  clientProfiles: DESK_RULES_PUBLIC_COMPATIBILITY.clientProfiles,
  recoveryPaths: {
    accountAccess: "/account/agent",
    billing: "/account/billing",
    pricing: "/pricing",
    providerConnections: "/account/apps",
  },
  manifestVersion: DESK_RULES_PUBLIC_COMPATIBILITY.manifestVersion,
  plugin: {
    codexMarketplaceStatus: "private-preview",
    packageName: "desk-rules-mcp",
  },
  productName: "Desk Rules MCP",
  serverName: DESK_RULES_PUBLIC_COMPATIBILITY.serverName,
} as const

export const DESK_RULES_MCP_READ_FIRST_TOOL_NAMES = [
  "inspect_mcp_authorization_status",
  "inspect_rules",
  "list_recent_designs",
  "inspect_design_metadata",
  "inspect_design_document",
  "inspect_design_page",
] as const

export const DESK_RULES_MCP_STARTER_PROFILE_TOOL_NAMES =
  DESK_RULES_PUBLIC_COMPATIBILITY.profiles.starterTools

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
