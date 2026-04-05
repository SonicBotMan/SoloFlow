import type { MarketplaceItem, SearchResult, SearchFilters } from "./types";
import { LocalRegistry } from "./registry";

export class DiscoveryService {
  private registry: LocalRegistry;

  constructor(registry: LocalRegistry) {
    this.registry = registry;
  }

  searchTemplates(query: string, filters?: Omit<SearchFilters, "kind">): SearchResult {
    return this.registry.search(query, { ...filters, kind: "template" });
  }

  searchSkills(query: string, filters?: Omit<SearchFilters, "kind">): SearchResult {
    return this.registry.search(query, { ...filters, kind: "skill" });
  }

  searchAgents(query: string, filters?: Omit<SearchFilters, "kind">): SearchResult {
    return this.registry.search(query, { ...filters, kind: "agent" });
  }

  getFeatured(limit: number = 10): MarketplaceItem[] {
    const result = this.registry.search("", {
      sortBy: "downloads",
      limit,
    });
    return result.items.filter((item) => item.metadata.featured);
  }

  getTrending(limit: number = 10): MarketplaceItem[] {
    this.registry.refreshDownloadStats();
    const result = this.registry.search("", {
      sortBy: "downloads",
      limit,
    });
    return result.items.filter((item) => item.downloads.trend === "up");
  }

  getByCategory(category: string, limit: number = 20): SearchResult {
    return this.registry.search("", { category, limit });
  }

  getByAuthor(author: string, limit: number = 20): SearchResult {
    return this.registry.search("", { author, limit });
  }

  getRecent(limit: number = 10): MarketplaceItem[] {
    const result = this.registry.search("", { sortBy: "recent", limit });
    return result.items;
  }

  getTopRated(limit: number = 10): MarketplaceItem[] {
    const result = this.registry.search("", {
      sortBy: "rating",
      limit,
    });
    return result.items;
  }
}
