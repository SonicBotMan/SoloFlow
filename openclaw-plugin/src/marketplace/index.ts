import type {
  InstalledItem,
  MarketplaceEvent,
  MarketplaceItem,
  Rating,
  RatingSummary,
  SearchFilters,
  SearchResult,
} from "./types";
import type { ItemMetadata } from "./types";
import type { WorkflowTemplate } from "../types";
import { LocalRegistry } from "./registry";
import { TemplatePublisher } from "./publisher";
import { DiscoveryService } from "./discovery";
import { RatingService } from "./ratings";

export interface MarketplaceSystemConfig {
  dbPath?: string;
  ratingsDbPath?: string;
  clawhubEndpoint?: string;
}

interface ClawHubClient {
  fetchItem(id: string): Promise<MarketplaceItem | undefined>;
  searchRemote(query: string, filters?: SearchFilters): Promise<SearchResult>;
}

function createClawHubClient(endpoint: string): ClawHubClient {
  return {
    async fetchItem(id: string): Promise<MarketplaceItem | undefined> {
      try {
        const resp = await fetch(`${endpoint}/api/items/${id}`);
        if (!resp.ok) return undefined;
        return (await resp.json()) as MarketplaceItem;
      } catch {
        return undefined;
      }
    },
    async searchRemote(query: string, filters?: SearchFilters): Promise<SearchResult> {
      try {
        const params = new URLSearchParams({ q: query });
        if (filters?.kind) params.set("kind", filters.kind);
        if (filters?.author) params.set("author", filters.author);
        if (filters?.category) params.set("category", filters.category);
        if (filters?.limit) params.set("limit", String(filters.limit));

        const resp = await fetch(`${endpoint}/api/search?${params}`);
        if (!resp.ok) return { items: [], total: 0, limit: filters?.limit ?? 20, offset: filters?.offset ?? 0 };
        return (await resp.json()) as SearchResult;
      } catch {
        return { items: [], total: 0, limit: 20, offset: 0 };
      }
    },
  };
}

export class MarketplaceSystem {
  readonly registry: LocalRegistry;
  readonly publisher: TemplatePublisher;
  readonly discovery: DiscoveryService;
  readonly ratings: RatingService;

  private clawhub: ClawHubClient | null = null;
  private listeners: Array<(event: MarketplaceEvent) => void> = [];

  constructor(config?: MarketplaceSystemConfig) {
    const dbPath = config?.dbPath ?? ":memory:";
    const ratingsDbPath = config?.ratingsDbPath ?? ":memory:";

    this.registry = new LocalRegistry(dbPath);
    this.publisher = new TemplatePublisher(this.registry);
    this.discovery = new DiscoveryService(this.registry);
    this.ratings = new RatingService(ratingsDbPath);

    if (config?.clawhubEndpoint) {
      this.clawhub = createClawHubClient(config.clawhubEndpoint);
    }

    this.registry.subscribe((event) => {
      for (const fn of this.listeners) {
        try { fn(event); } catch { /* swallow */ }
      }
    });
  }

  // ── Composite Operations ─────────────────────────────────────────────

  async search(query: string, filters?: SearchFilters): Promise<SearchResult> {
    const local = this.registry.search(query, filters);

    if (this.clawhub && !filters?.author) {
      const remote = await this.clawhub.searchRemote(query, filters);
      const seen = new Set(local.items.map((i) => i.metadata.id));
      const merged = [
        ...local.items,
        ...remote.items.filter((i) => !seen.has(i.metadata.id)),
      ];
      return { ...local, items: merged, total: local.total + remote.total };
    }

    return local;
  }

  async get(itemId: string): Promise<MarketplaceItem | undefined> {
    const local = this.registry.get(itemId);
    if (local) return local;

    if (this.clawhub) {
      return this.clawhub.fetchItem(itemId);
    }

    return undefined;
  }

  async install(itemId: string, installPath?: string): Promise<InstalledItem> {
    if (!this.registry.get(itemId) && this.clawhub) {
      const remote = await this.clawhub.fetchItem(itemId);
      if (remote) {
        this.registry.publish(remote.metadata, remote.content);
      }
    }
    return this.registry.install(itemId, installPath);
  }

  uninstall(itemId: string): void {
    this.registry.uninstall(itemId);
  }

  listInstalled(): InstalledItem[] {
    return this.registry.listInstalled();
  }

  rateItem(itemId: string, userId: string, stars: 1 | 2 | 3 | 4 | 5, review?: string): Rating {
    return this.ratings.rateItem(itemId, userId, stars, review);
  }

  getRating(itemId: string): RatingSummary {
    return this.ratings.getRating(itemId);
  }

  publishWorkflow(
    workflow: WorkflowTemplate,
    metadata: Omit<ItemMetadata, "kind" | "updatedAt">,
  ) {
    return this.publisher.publishWorkflow(workflow, metadata);
  }

  subscribe(listener: (event: MarketplaceEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  close(): void {
    this.registry.close();
    this.ratings.close();
    this.listeners.length = 0;
  }
}

export { LocalRegistry } from "./registry";
export { TemplatePublisher } from "./publisher";
export { DiscoveryService } from "./discovery";
export { RatingService } from "./ratings";
export type {
  MarketplaceItem,
  TemplateListing,
  SkillListing,
  AgentListing,
  ItemMetadata,
  Rating,
  RatingSummary,
  DownloadStats,
  SearchFilters,
  SearchResult,
  InstalledItem,
  VersionInfo,
  MarketplaceEvent,
  MarketplaceItemKind,
} from "./types";
