/**
 * SoloFlow — API Routes: Evolved Templates & Skills
 * REST endpoints for the Skill Viewer.
 */

import type { ApiRequest, ApiResponse } from "../types.js";
import { jsonResponse, HttpError } from "../router.js";
import type { EvolutionStore } from "../../evolution/evolution-store.js";

export interface EvolvedRoutes {
  listEvolved: (req: ApiRequest) => Promise<ApiResponse>;
  getEvolved: (req: ApiRequest) => Promise<ApiResponse>;
  searchEvolved: (req: ApiRequest) => Promise<ApiResponse>;
  evolveStats: (req: ApiRequest) => Promise<ApiResponse>;
  deleteEvolved: (req: ApiRequest) => Promise<ApiResponse>;
  recordUsage: (req: ApiRequest) => Promise<ApiResponse>;
  listSkills: (req: ApiRequest) => Promise<ApiResponse>;
  searchSkills: (req: ApiRequest) => Promise<ApiResponse>;
}

export function createEvolvedRoutes(
  evolutionStore: EvolutionStore | null,
  skillInventory: any,
): EvolvedRoutes {
  return {
    // GET /evolved — list all evolved templates
    async listEvolved(req: ApiRequest): Promise<ApiResponse> {
      if (!evolutionStore) return jsonResponse(503, { error: "Evolution system not ready yet, try again in a few seconds" });
      const type = req.query["type"] as string | undefined;
      const templates = evolutionStore.getAll(type as any);
      return jsonResponse(200, {
        data: templates,
        total: templates.length,
        workflows: templates.filter((t) => t.type === "workflow").length,
        skills: templates.filter((t) => t.type === "skill").length,
      });
    },

    // GET /evolved/:id — get single template
    async getEvolved(req: ApiRequest): Promise<ApiResponse> {
      if (!evolutionStore) return jsonResponse(503, { error: "Evolution system not ready yet" });
      const id = req.params["id"] ?? "";
      const t = evolutionStore.getById(id);
      if (!t) throw new HttpError(404, `Template not found: ${id}`);
      return jsonResponse(200, t);
    },

    // GET /evolved/search?q=&type= — search templates
    async searchEvolved(req: ApiRequest): Promise<ApiResponse> {
      if (!evolutionStore) return jsonResponse(503, { error: "Evolution system not ready yet" });
      const q = (req.query["q"] as string) ?? "";
      const type = req.query["type"] as string | undefined;
      const results = evolutionStore.search(q, type as any, 20);
      return jsonResponse(200, { data: results, query: q, type });
    },

    // GET /evolved/stats — aggregate stats
    async evolveStats(_req: ApiRequest): Promise<ApiResponse> {
      if (!evolutionStore) return jsonResponse(503, { error: "Evolution system not ready yet" });
      const workflows = evolutionStore.getAll("workflow");
      const skills = evolutionStore.getAll("skill");
      const all = evolutionStore.getAll();
      const totalUses = all.reduce((s, t) => s + t.useCount, 0);
      const totalSuccess = all.reduce((s, t) => s + t.successCount, 0);
      const avgQuality =
        all.length > 0 ? all.reduce((s, t) => s + t.qualityScore, 0) / all.length : 0;
      return jsonResponse(200, {
        total: all.length,
        workflows: workflows.length,
        skills: skills.length,
        totalUses,
        avgSuccessRate: totalUses > 0 ? totalSuccess / totalUses : 0,
        avgQualityScore: avgQuality,
        topTemplates: all
          .sort((a, b) => b.useCount - a.useCount)
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            useCount: t.useCount,
            qualityScore: t.qualityScore,
          })),
      });
    },

    // DELETE /evolved/:id
    async deleteEvolved(req: ApiRequest): Promise<ApiResponse> {
      if (!evolutionStore) return jsonResponse(503, { error: "Evolution system not ready yet" });
      const id = req.params["id"] ?? "";
      evolutionStore.delete(id);
      return jsonResponse(200, { ok: true, id });
    },

    // POST /evolved/:id/record-usage
    async recordUsage(req: ApiRequest): Promise<ApiResponse> {
      if (!evolutionStore) return jsonResponse(503, { error: "Evolution system not ready yet" });
      const id = req.params["id"] ?? "";
      const body = (req.body as any) ?? {};
      const success = body.success !== false;
      evolutionStore.recordUsage(id, success);
      return jsonResponse(200, { ok: true, id, success });
    },

    // GET /skills — list all skills (from skillInventory)
    async listSkills(_req: ApiRequest): Promise<ApiResponse> {
      if (!skillInventory) {
        return jsonResponse(200, { data: [], total: 0, note: "Skill inventory not available" });
      }
      try {
        const skills = skillInventory.getAll();
        return jsonResponse(200, { data: skills, total: skills.length });
      } catch (e) {
        return jsonResponse(200, { data: [], total: 0, error: String(e) });
      }
    },

    // GET /skills/search?q= — search skills
    async searchSkills(req: ApiRequest): Promise<ApiResponse> {
      if (!skillInventory) {
        return jsonResponse(200, { data: [], total: 0 });
      }
      const q = ((req.query["q"] as string) ?? "").toLowerCase();
      const all = skillInventory.getAll();
      const results = q
        ? all.filter(
            (s: any) =>
              (s.name ?? "").toLowerCase().includes(q) ||
              (s.description ?? "").toLowerCase().includes(q) ||
              (s.tags ?? []).some((t: string) => t.toLowerCase().includes(q)),
          )
        : all;
      return jsonResponse(200, { data: results.slice(0, 20), total: results.length, query: q });
    },
  };
}
