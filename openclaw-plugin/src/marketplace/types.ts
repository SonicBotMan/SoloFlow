/**
 * SoloFlow — Plugin Marketplace Types
 *
 * Defines the core types for the marketplace infrastructure:
 * sharing and installing workflow templates, skills, and agents.
 */

import type { AgentDiscipline, WorkflowTemplate } from "../types.js";
import type { Skill } from "../skills/types.js";

// ─── Marketplace Item Kinds ──────────────────────────────────────────

export const MARKETPLACE_ITEM_KINDS = ["template", "skill", "agent"] as const;
export type MarketplaceItemKind = (typeof MARKETPLACE_ITEM_KINDS)[number];

// ─── Item Metadata ───────────────────────────────────────────────────

export interface ItemMetadata {
  /** Unique identifier for the listing */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Longer README-style content */
  readme?: string;
  /** Item kind (template, skill, agent) */
  kind: MarketplaceItemKind;
  /** Author identifier */
  author: string;
  /** Semantic version string */
  version: string;
  /** Tags for categorization and search */
  tags: string[];
  /** Category (e.g. "automation", "research", "content") */
  category: string;
  /** SPDX license identifier */
  license: string;
  /** URL to source repository */
  repository?: string;
  /** URL to homepage */
  homepage?: string;
  /** Creation timestamp (epoch ms) */
  createdAt: number;
  /** Last update timestamp (epoch ms) */
  updatedAt: number;
  /** Whether the item is featured on the marketplace */
  featured: boolean;
  /** Minimum SoloFlow version required */
  minSoloflowVersion?: string;
  /** Supported disciplines for agent listings */
  disciplines?: AgentDiscipline[];
}

// ─── Rating ──────────────────────────────────────────────────────────

export interface Rating {
  /** Unique rating ID */
  id: string;
  /** ID of the item being rated */
  itemId: string;
  /** User who submitted the rating */
  userId: string;
  /** Star rating 1-5 */
  stars: 1 | 2 | 3 | 4 | 5;
  /** Optional text review */
  review?: string;
  /** Timestamp (epoch ms) */
  createdAt: number;
}

export interface RatingSummary {
  /** Average star rating */
  average: number;
  /** Total number of ratings */
  count: number;
  /** Distribution: index 0 = 1-star, index 4 = 5-star */
  distribution: [number, number, number, number, number];
}

// ─── Download Stats ──────────────────────────────────────────────────

export interface DownloadStats {
  /** Total downloads */
  total: number;
  /** Downloads in the last 7 days */
  weekly: number;
  /** Downloads in the last 30 days */
  monthly: number;
  /** Trend direction */
  trend: "up" | "down" | "stable";
}

// ─── Marketplace Item (base) ─────────────────────────────────────────

export interface MarketplaceItem {
  metadata: ItemMetadata;
  /** The actual payload — varies by kind */
  content: unknown;
  ratings: RatingSummary;
  downloads: DownloadStats;
}

// ─── Specific Listings ───────────────────────────────────────────────

export interface TemplateListing extends MarketplaceItem {
  metadata: ItemMetadata & { kind: "template" };
  content: WorkflowTemplate;
}

export interface SkillListing extends MarketplaceItem {
  metadata: ItemMetadata & { kind: "skill" };
  content: Omit<Skill, "installed">;
}

export interface AgentListing extends MarketplaceItem {
  metadata: ItemMetadata & { kind: "agent" };
  content: {
    name: string;
    description: string;
    discipline: AgentDiscipline;
    systemPrompt: string;
    tools: string[];
    config: Record<string, unknown>;
  };
}

// ─── Search ──────────────────────────────────────────────────────────

export interface SearchFilters {
  kind?: MarketplaceItemKind;
  category?: string;
  author?: string;
  minRating?: number;
  tags?: string[];
  sortBy?: "downloads" | "rating" | "recent" | "name";
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  items: MarketplaceItem[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Installed Item ──────────────────────────────────────────────────

export interface InstalledItem {
  itemId: string;
  kind: MarketplaceItemKind;
  installedAt: number;
  version: string;
  /** Path where the item content is stored */
  installPath: string;
}

// ─── Version Info ────────────────────────────────────────────────────

export interface VersionInfo {
  version: string;
  releasedAt: number;
  changelog?: string;
}

// ─── Marketplace Events ──────────────────────────────────────────────

export type MarketplaceEvent =
  | { type: "item:published"; itemId: string }
  | { type: "item:updated"; itemId: string; version: string }
  | { type: "item:removed"; itemId: string }
  | { type: "item:installed"; itemId: string }
  | { type: "item:uninstalled"; itemId: string }
  | { type: "item:rated"; itemId: string; stars: number }
  | { type: "item:downloaded"; itemId: string };
