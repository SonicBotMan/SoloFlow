import BetterSqlite3 from "better-sqlite3";
type Database = BetterSqlite3.Database;
import type { Rating, RatingSummary } from "./types.js";

const RATINGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ratings (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    stars      INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    review     TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE(item_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ratings_item ON ratings(item_id);
`;

interface RatingRow {
  id: string;
  item_id: string;
  user_id: string;
  stars: number;
  review: string;
  created_at: number;
}

interface RatingCountRow {
  stars: number;
  cnt: number;
}

function generateId(): string {
  return `rat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class RatingService {
  private db: Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new BetterSqlite3(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec(RATINGS_SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  rateItem(itemId: string, userId: string, stars: 1 | 2 | 3 | 4 | 5, review?: string): Rating {
    if (stars < 1 || stars > 5) throw new Error("Stars must be between 1 and 5");

    const id = generateId();
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO ratings (id, item_id, user_id, stars, review, created_at)
      VALUES ($id, $itemId, $userId, $stars, $review, $createdAt)
      ON CONFLICT(item_id, user_id) DO UPDATE SET
        stars=$stars, review=$review, created_at=$createdAt
    `).run({
      $id: id,
      $itemId: itemId,
      $userId: userId,
      $stars: stars,
      $review: review ?? "",
      $createdAt: now,
    });

    return {
      id,
      itemId,
      userId,
      stars,
      review: review || undefined,
      createdAt: now,
    };
  }

  getRating(itemId: string): RatingSummary {
    const rows = this.db.prepare(
      "SELECT stars, COUNT(*) as cnt FROM ratings WHERE item_id = ? GROUP BY stars"
    ).all(itemId) as RatingCountRow[];

    const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let totalStars = 0;
    let totalCount = 0;

    for (const row of rows) {
      distribution[row.stars - 1] = row.cnt;
      totalStars += row.stars * row.cnt;
      totalCount += row.cnt;
    }

    return {
      average: totalCount > 0 ? Math.round((totalStars / totalCount) * 100) / 100 : 0,
      count: totalCount,
      distribution,
    };
  }

  getRatings(itemId: string, limit: number = 50, offset: number = 0): Rating[] {
    const rows = this.db.prepare(
      "SELECT * FROM ratings WHERE item_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(itemId, limit, offset) as RatingRow[];

    return rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      userId: row.user_id,
      stars: row.stars as 1 | 2 | 3 | 4 | 5,
      review: row.review || undefined,
      createdAt: row.created_at,
    }));
  }

  deleteRating(ratingId: string): void {
    this.db.prepare("DELETE FROM ratings WHERE id = ?").run(ratingId);
  }

  getUserRating(itemId: string, userId: string): Rating | undefined {
    const row = this.db.prepare(
      "SELECT * FROM ratings WHERE item_id = ? AND user_id = ?"
    ).get(itemId, userId) as RatingRow | null;

    if (!row) return undefined;

    return {
      id: row.id,
      itemId: row.item_id,
      userId: row.user_id,
      stars: row.stars as 1 | 2 | 3 | 4 | 5,
      review: row.review || undefined,
      createdAt: row.created_at,
    };
  }
}
