import type { WorkflowTemplate } from "../types";
import type {
  AgentListing,
  ItemMetadata,
  MarketplaceItemKind,
  SkillListing,
  TemplateListing,
} from "./types";
import { LocalRegistry } from "./registry";

type ListingByKind<K extends MarketplaceItemKind> =
  K extends "template" ? TemplateListing
    : K extends "skill" ? SkillListing
      : K extends "agent" ? AgentListing
        : never;

export class TemplatePublisher {
  private registry: LocalRegistry;

  constructor(registry: LocalRegistry) {
    this.registry = registry;
  }

  publishWorkflow(
    workflow: WorkflowTemplate,
    metadata: Omit<ItemMetadata, "kind" | "updatedAt">,
  ): TemplateListing {
    const now = Date.now();
    const fullMetadata: ItemMetadata = {
      ...metadata,
      kind: "template",
      createdAt: metadata.createdAt,
      updatedAt: now,
    };

    this.registry.publish(fullMetadata, workflow);

    const item = this.registry.get(metadata.id);
    if (!item) throw new Error(`Failed to publish workflow: ${metadata.id}`);

    return item as TemplateListing;
  }

  publishSkill(
    skill: Omit<SkillListing["content"], never>,
    metadata: Omit<ItemMetadata, "kind" | "updatedAt">,
  ): SkillListing {
    const now = Date.now();
    const fullMetadata: ItemMetadata = {
      ...metadata,
      kind: "skill",
      createdAt: metadata.createdAt,
      updatedAt: now,
    };

    this.registry.publish(fullMetadata, skill);

    const item = this.registry.get(metadata.id);
    if (!item) throw new Error(`Failed to publish skill: ${metadata.id}`);

    return item as SkillListing;
  }

  publishAgent(
    agent: AgentListing["content"],
    metadata: Omit<ItemMetadata, "kind" | "updatedAt">,
  ): AgentListing {
    const now = Date.now();
    const fullMetadata: ItemMetadata = {
      ...metadata,
      kind: "agent",
      createdAt: metadata.createdAt,
      updatedAt: now,
    };

    this.registry.publish(fullMetadata, agent);

    const item = this.registry.get(metadata.id);
    if (!item) throw new Error(`Failed to publish agent: ${metadata.id}`);

    return item as AgentListing;
  }

  updateListing<K extends MarketplaceItemKind>(
    itemId: string,
    updates: { content?: ListingByKind<K>["content"]; metadata?: Partial<ItemMetadata> },
  ): ListingByKind<K> {
    const existing = this.registry.get(itemId);
    if (!existing) throw new Error(`Item not found: ${itemId}`);

    const mergedMetadata: ItemMetadata = {
      ...existing.metadata,
      ...updates.metadata,
      updatedAt: Date.now(),
    };

    this.registry.publish(mergedMetadata, updates.content ?? existing.content);

    const updated = this.registry.get(itemId);
    if (!updated) throw new Error(`Failed to update item: ${itemId}`);

    return updated as ListingByKind<K>;
  }

  removeListing(itemId: string): void {
    this.registry.remove(itemId);
  }
}
