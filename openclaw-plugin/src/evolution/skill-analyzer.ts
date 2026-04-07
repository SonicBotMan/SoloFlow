import type { SkillInventory } from "./skill-inventory.js";

export interface SkillInsight {
  type: "redundancy" | "combination" | "unused" | "opportunity";
  skillA?: string;
  skillB?: string;
  confidence: number;
  description: string;
  recommendation: string;
}

export class SkillAnalyzer {
  private skillInventory: SkillInventory;
  private db: any;
  private api: any;

  constructor(skillInventory: SkillInventory, db: any, api: any) {
    this.skillInventory = skillInventory;
    this.db = db;
    this.api = api;
  }

  async analyze(): Promise<{ insights: number; suggestions: number }> {
    // 1. Scan installed skills
    const scanResult = this.skillInventory.scan();
    this.api.logger.info(`skill inventory: ${scanResult.added} added, ${scanResult.updated} updated`);

    // 2. Analyze usage patterns
    const insights = this.analyzeUsagePatterns();
    const suggestions = this.analyzeOpportunities();

    // 3. Save insights
    const now = Date.now();
    for (const insight of [...insights, ...suggestions]) {
      try {
        this.db.prepare(`
          INSERT INTO skill_insights (type, skill_a, skill_b, confidence, description, recommendation, discovered_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          insight.type,
          insight.skillA ?? null,
          insight.skillB ?? null,
          insight.confidence,
          insight.description,
          insight.recommendation,
          now
        );
      } catch (e) { console.warn(`dedup by time + type: ${e}`); }
    }

    return { insights: insights.length, suggestions: suggestions.length };
  }

  private analyzeUsagePatterns(): SkillInsight[] {
    const insights: SkillInsight[] = [];

    // Detect unused skills
    const allSkills = this.skillInventory.getAll();
    const recentlyUsed = this.skillInventory.getRecentlyUsed(100);
    const usedIds = new Set(recentlyUsed.map((r: any) => r.skill_id));

    for (const skill of allSkills) {
      if (!usedIds.has(skill.id)) {
        insights.push({
          type: "unused",
          skillA: skill.id,
          confidence: 0.8,
          description: `Skill "${skill.name}" is installed but never used in the last 30 days`,
          recommendation: `Consider removing or repurposing "${skill.name}"`,
        });
      }
    }

    // Detect combination patterns
    const combinations = this.skillInventory.getCombinationPatterns();
    for (const combo of combinations.slice(0, 5)) {
      insights.push({
        type: "combination",
        skillA: combo.skills[0],
        skillB: combo.skills[1],
        confidence: Math.min(0.9, combo.count * 0.2),
        description: `Skills "${combo.skills[0]}" and "${combo.skills[1]}" are frequently used together (${combo.count} times)`,
        recommendation: `Consider combining these into a workflow template`,
      });
    }

    return insights;
  }

  private analyzeOpportunities(): SkillInsight[] {
    const skills = this.skillInventory.getAll();
    const insights: SkillInsight[] = [];

    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const a = skills[i], b = skills[j];
        const wordsA = new Set(a.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4));
        const wordsB = new Set(b.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4));
        const overlap = [...wordsA].filter(w => wordsB.has(w)).length;
        const union = new Set([...wordsA, ...wordsB]).size;
        const jaccard = union > 0 ? overlap / union : 0;

        if (jaccard >= 0.5) {
          insights.push({
            type: "redundancy",
            skillA: a.id,
            skillB: b.id,
            confidence: jaccard,
            description: `Skills "${a.name}" and "${b.name}" have overlapping descriptions (${(jaccard * 100).toFixed(0)}% similarity)`,
            recommendation: `Review if these skills serve distinct purposes or could be merged`,
          });
        }
      }
    }

    return insights;
  }

  getInsights(limit: number = 20): any[] {
    return this.db.prepare(`
      SELECT * FROM skill_insights ORDER BY discovered_at DESC, confidence DESC LIMIT ?
    `).all(limit);
  }
}
