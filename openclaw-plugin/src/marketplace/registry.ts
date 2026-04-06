import BetterSqlite3 from "better-sqlite3";
type Database = BetterSqlite3.Database;
import type {
  InstalledItem,
  MarketplaceEvent,
  MarketplaceItem,
  MarketplaceItemKind,
  SearchFilters,
  SearchResult,
  VersionInfo,
} from "./types";
import type { ItemMetadata } from "./types";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    readme     TEXT DEFAULT '',
    kind       TEXT NOT NULL CHECK(kind IN ('template','skill','agent')),
    author     TEXT NOT NULL,
    version    TEXT NOT NULL,
    tags       TEXT DEFAULT '[]',
    category   TEXT DEFAULT '',
    license    TEXT DEFAULT 'MIT',
    repository TEXT DEFAULT '',
    homepage   TEXT DEFAULT '',
    featured   INTEGER DEFAULT 0,
    min_soloflow_version TEXT DEFAULT '',
    disciplines TEXT DEFAULT '[]',
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    downloads  INTEGER DEFAULT 0,
    weekly_downloads INTEGER DEFAULT 0,
    monthly_downloads INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);
  CREATE INDEX IF NOT EXISTS idx_items_author ON items(author);
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
  CREATE INDEX IF NOT EXISTS idx_items_featured ON items(featured);

  CREATE TABLE IF NOT EXISTS versions (
    item_id    TEXT NOT NULL,
    version    TEXT NOT NULL,
    content    TEXT NOT NULL,
    changelog  TEXT DEFAULT '',
    released_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, version),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS installed (
    item_id      TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    installed_at INTEGER NOT NULL,
    version      TEXT NOT NULL,
    install_path TEXT DEFAULT '',
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS download_events (
    item_id   TEXT NOT NULL,
    downloaded_at INTEGER NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );
`;

interface ItemRow {
  id: string;
  name: string;
  description: string;
  readme: string;
  kind: string;
  author: string;
  version: string;
  tags: string;
  category: string;
  license: string;
  repository: string;
  homepage: string;
  featured: number;
  min_soloflow_version: string;
  disciplines: string;
  content: string;
  created_at: number;
  updated_at: number;
  downloads: number;
  weekly_downloads: number;
  monthly_downloads: number;
}

interface InstalledRow {
  item_id: string;
  kind: string;
  installed_at: number;
  version: string;
  install_path: string;
}

interface VersionRow {
  version: string;
  released_at: number;
  changelog: string;
}

interface CountRow {
  cnt: number;
}

function metadataFromRow(row: ItemRow): ItemMetadata {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    readme: row.readme || undefined,
    kind: row.kind as MarketplaceItemKind,
    author: row.author,
    version: row.version,
    tags: JSON.parse(row.tags || "[]"),
    category: row.category,
    license: row.license,
    repository: row.repository || undefined,
    homepage: row.homepage || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    featured: Boolean(row.featured),
    minSoloflowVersion: row.min_soloflow_version || undefined,
    disciplines: JSON.parse(row.disciplines || "[]"),
  };
}

function itemFromRow(row: ItemRow): MarketplaceItem {
  const weeklyDl = row.weekly_downloads;
  const monthlyDl = row.monthly_downloads;
  const trend: "up" | "down" | "stable" =
    weeklyDl * 4 >= monthlyDl ? "up"
      : weeklyDl * 4 < monthlyDl * 0.5 ? "down"
      : "stable";

  return {
    metadata: metadataFromRow(row),
    content: JSON.parse(row.content),
    ratings: { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] },
    downloads: {
      total: row.downloads,
      weekly: weeklyDl,
      monthly: monthlyDl,
      trend,
    },
  };
}

export class LocalRegistry {
  private db: Database;
  private listeners: Array<(event: MarketplaceEvent) => void> = [];

  constructor(dbPath: string = ":memory:") {
    this.db = new BetterSqlite3(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  subscribe(listener: (event: MarketplaceEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private emit(event: MarketplaceEvent): void {
    for (const fn of this.listeners) {
      try { fn(event); } catch { /* swallow */ }
    }
  }

  publish(metadata: ItemMetadata, content: unknown): void {
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO items (id, name, description, readme, kind, author, version,
        tags, category, license, repository, homepage, featured,
        min_soloflow_version, disciplines, content, created_at, updated_at)
      VALUES ($id, $name, $description, $readme, $kind, $author, $version,
        $tags, $category, $license, $repository, $homepage, $featured,
        $minSoloflowVersion, $disciplines, $content, $createdAt, $updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        name=$name, description=$description, readme=$readme, kind=$kind,
        author=$author, version=$version, tags=$tags, category=$category,
        license=$license, repository=$repository, homepage=$homepage,
        featured=$featured, min_soloflow_version=$minSoloflowVersion,
        disciplines=$disciplines, content=$content, updated_at=$updatedAt
    `).run({
      $id: metadata.id,
      $name: metadata.name,
      $description: metadata.description,
      $readme: metadata.readme ?? "",
      $kind: metadata.kind,
      $author: metadata.author,
      $version: metadata.version,
      $tags: JSON.stringify(metadata.tags),
      $category: metadata.category,
      $license: metadata.license,
      $repository: metadata.repository ?? "",
      $homepage: metadata.homepage ?? "",
      $featured: metadata.featured ? 1 : 0,
      $minSoloflowVersion: metadata.minSoloflowVersion ?? "",
      $disciplines: JSON.stringify(metadata.disciplines ?? []),
      $content: JSON.stringify(content),
      $createdAt: metadata.createdAt || now,
      $updatedAt: now,
    });

    this.db.prepare(`
      INSERT INTO versions (item_id, version, content, changelog, released_at)
      VALUES ($itemId, $version, $content, $changelog, $releasedAt)
    `).run({
      $itemId: metadata.id,
      $version: metadata.version,
      $content: JSON.stringify(content),
      $changelog: "",
      $releasedAt: now,
    });

    this.emit({ type: "item:published", itemId: metadata.id });
  }

  get(itemId: string): MarketplaceItem | undefined {
    const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(itemId) as ItemRow | null;
    if (!row) return undefined;
    return itemFromRow(row);
  }

  search(query: string, filters?: SearchFilters): SearchResult {
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;

    let sql = "SELECT * FROM items WHERE 1=1";
    const values: Array<string | number> = [];

    if (query) {
      sql += " AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)";
      values.push(`%${query}%`, `%${query}%`, `%"${query}"%`);
    }

    if (filters?.kind) {
      sql += " AND kind = ?";
      values.push(filters.kind);
    }
    if (filters?.author) {
      sql += " AND author = ?";
      values.push(filters.author);
    }
    if (filters?.category) {
      sql += " AND category = ?";
      values.push(filters.category);
    }
    if (filters?.tags && filters.tags.length > 0) {
      const tagClauses = filters.tags.map(() => `tags LIKE ?`);
      sql += ` AND (${tagClauses.join(" OR ")})`;
      for (const tag of filters.tags) {
        values.push(`%"${tag}"%`);
      }
    }

    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as cnt");
    const countRow = this.db.prepare(countSql).get(...values) as CountRow | null;
    const total = countRow?.cnt ?? 0;

    const sort = filters?.sortBy ?? "recent";
    switch (sort) {
      case "downloads": sql += " ORDER BY downloads DESC"; break;
      case "rating": sql += " ORDER BY downloads DESC"; break;
      case "name": sql += " ORDER BY name ASC"; break;
      case "recent": default: sql += " ORDER BY updated_at DESC"; break;
    }

    sql += " LIMIT ? OFFSET ?";
    values.push(limit, offset);

    const rows = this.db.prepare(sql).all(...values) as ItemRow[];
    const items = rows.map((row) => itemFromRow(row));

    return { items, total, limit, offset };
  }

  install(itemId: string, installPath?: string): InstalledItem {
    const row = this.db.prepare("SELECT * FROM items WHERE id = ?").get(itemId) as ItemRow | null;
    if (!row) throw new Error(`Item not found: ${itemId}`);

    const now = Date.now();
    const path = installPath ?? `~/.soloflow/installed/${itemId}`;

    this.db.prepare(`
      INSERT INTO installed (item_id, kind, installed_at, version, install_path)
      VALUES ($itemId, $kind, $installedAt, $version, $installPath)
      ON CONFLICT(item_id) DO UPDATE SET
        kind=$kind, installed_at=$installedAt, version=$version, install_path=$installPath
    `).run({
      $itemId: itemId,
      $kind: row.kind,
      $installedAt: now,
      $version: row.version,
      $installPath: path,
    });

    this.db.prepare("UPDATE items SET downloads = downloads + 1 WHERE id = ?").run(itemId);
    this.db.prepare("INSERT INTO download_events (item_id, downloaded_at) VALUES (?, ?)").run(itemId, now);

    this.emit({ type: "item:installed", itemId });
    this.emit({ type: "item:downloaded", itemId });

    return {
      itemId,
      kind: row.kind as MarketplaceItemKind,
      installedAt: now,
      version: row.version,
      installPath: path,
    };
  }

  uninstall(itemId: string): void {
    const existing = this.db.prepare("SELECT item_id FROM installed WHERE item_id = ?").get(itemId);
    if (!existing) throw new Error(`Item not installed: ${itemId}`);

    this.db.prepare("DELETE FROM installed WHERE item_id = ?").run(itemId);
    this.emit({ type: "item:uninstalled", itemId });
  }

  listInstalled(): InstalledItem[] {
    const rows = this.db.prepare("SELECT * FROM installed ORDER BY installed_at DESC").all() as InstalledRow[];
    return rows.map((row) => ({
      itemId: row.item_id,
      kind: row.kind as MarketplaceItemKind,
      installedAt: row.installed_at,
      version: row.version,
      installPath: row.install_path,
    }));
  }

  isInstalled(itemId: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM installed WHERE item_id = ?").get(itemId);
    return row !== null;
  }

  remove(itemId: string): void {
    this.db.prepare("DELETE FROM items WHERE id = ?").run(itemId);
    this.emit({ type: "item:removed", itemId });
  }

  getVersions(itemId: string): VersionInfo[] {
    const rows = this.db.prepare(
      "SELECT version, released_at, changelog FROM versions WHERE item_id = ? ORDER BY released_at DESC"
    ).all(itemId) as VersionRow[];

    return rows.map((row) => ({
      version: row.version,
      releasedAt: row.released_at,
      changelog: row.changelog || undefined,
    }));
  }

  refreshDownloadStats(): void {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

    this.db.prepare(`
      UPDATE items SET
        weekly_downloads = (SELECT COUNT(*) FROM download_events WHERE item_id = items.id AND downloaded_at >= ?),
        monthly_downloads = (SELECT COUNT(*) FROM download_events WHERE item_id = items.id AND downloaded_at >= ?)
    `).run(weekAgo, monthAgo);
  }
}
