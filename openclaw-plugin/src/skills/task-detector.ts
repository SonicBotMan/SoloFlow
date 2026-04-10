import type { AgentDiscipline, Workflow } from "../types.js";
import type { DetectedTask, TaskPattern } from "./types.js";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MIN_PATTERN_OCCURRENCES = 2;
const JACCARD_THRESHOLD = 0.5;

function normalize(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

function stepSignature(name: string, discipline: AgentDiscipline): string {
  return `${discipline}:${normalize(name)}`;
}

function configKeys(config: Record<string, unknown>): string[] {
  return Object.keys(config).sort();
}

/** Simple Jaccard similarity between two sets of tokens */
function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Split text into keyword tokens for matching */
function extractKeywords(text: string): string[] {
  return normalize(text)
    .split(/[^\w\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 2);
}

/** Tool usage pattern: tool_name(args...) */
const TOOL_CALL_RE = /(\w+)\s*\(/g;

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface ConversationDetectedTask {
  id: string;
  keywords: string[];
  tools: string[];
  topics: string[];
  startTime: number;
  endTime: number;
  messageCount: number;
}

export interface WorkflowRecommendation {
  templateId: string;
  confidence: number;
  matchedKeywords: string[];
}

/** Extended TaskPattern with fuzzy match fields */
export interface ExtendedTaskPattern extends TaskPattern {
  confidence: number;
  suggestedWorkflowName?: string;
  suggestedSteps?: Array<{ name: string; discipline: AgentDiscipline }>;
}

export class TaskDetector {
  private taskHistory: DetectedTask[] = [];

  detectTasks(workflow: Workflow): DetectedTask | null {
    if (workflow.state !== "completed") return null;

    const steps = Array.from(workflow.steps.values());
    if (steps.length === 0) return null;

    const completedSteps = steps.filter((s) => s.state === "completed");
    if (completedSteps.length === 0) return null;

    const durationMs =
      completedSteps.reduce((sum, s) => {
        const stepDuration =
          s.completedAt && s.startedAt ? s.completedAt - s.startedAt : 0;
        return sum + stepDuration;
      }, 0);

    if (durationMs > TWO_HOURS_MS) return null;

    const detectedSteps = completedSteps.map((s) => ({
      name: s.name,
      discipline: s.discipline,
      config: s.config,
      signature: stepSignature(s.name, s.discipline),
      completedAt: s.completedAt,
    }));

    const signatureSequence = detectedSteps
      .map((s) => s.signature)
      .join("|");

    const task: DetectedTask = {
      workflowId: workflow.id as unknown as string,
      workflowName: workflow.name,
      steps: detectedSteps,
      signatureSequence,
      durationMs,
      completedAt: workflow.updatedAt,
    };

    this.taskHistory.push(task);
    return task;
  }

  /**
   * Detect task patterns from completed workflows.
   * Now supports fuzzy matching via Jaccard similarity.
   */
  findPatterns(taskHistory?: DetectedTask[]): ExtendedTaskPattern[] {
    const history = taskHistory ?? this.taskHistory;
    if (history.length < MIN_PATTERN_OCCURRENCES) return [];

    const groups = new Map<string, DetectedTask[]>();
    for (const task of history) {
      const existing = groups.get(task.signatureSequence);
      if (existing) {
        existing.push(task);
      } else {
        groups.set(task.signatureSequence, [task]);
      }
    }

    const patterns: ExtendedTaskPattern[] = [];

    for (const [signature, tasks] of groups) {
      if (tasks.length < MIN_PATTERN_OCCURRENCES) continue;

      const reference = tasks[0]!;
      const stepSignatures = signature.split("|");
      const disciplines = reference.steps.map((s) => s.discipline);

      const paramTemplates = reference.steps.map((s) => {
        const keys = configKeys(s.config);
        const template: Record<string, unknown> = {};
        for (const key of keys) {
          template[key] = typeof s.config[key];
        }
        return template;
      });

      const nameCounts = new Map<string, number>();
      for (const t of tasks) {
        nameCounts.set(t.workflowName, (nameCounts.get(t.workflowName) ?? 0) + 1);
      }
      let bestName = "";
      let bestCount = 0;
      for (const [name, count] of nameCounts) {
        if (count > bestCount) { bestName = name; bestCount = count; }
      }

      const suggestedSteps = reference.steps.map((s) => ({
        name: s.name,
        discipline: s.discipline,
      }));

      patterns.push({
        id: `pattern-${signature.replace(/[^a-z0-9]/g, "-")}`,
        stepSignatures,
        paramTemplates,
        occurrenceCount: tasks.length,
        lastSeen: Math.max(...tasks.map((t) => t.completedAt)),
        workflowIds: tasks.map((t) => t.workflowId),
        disciplines,
        confidence: 1.0,
        suggestedWorkflowName: bestName,
        suggestedSteps,
      });
    }

    // Fuzzy matching: merge groups with Jaccard >= 0.5
    const merged: ExtendedTaskPattern[] = [];
    const assigned = new Set<number>();
    for (let i = 0; i < patterns.length; i++) {
      if (assigned.has(i)) continue;
      assigned.add(i);
      let group = [patterns[i]!];
      for (let j = i + 1; j < patterns.length; j++) {
        if (assigned.has(j)) continue;
        const sigA = patterns[i]!.stepSignatures;
        const sigB = patterns[j]!.stepSignatures;
        const sim = jaccard(sigA, sigB);
        if (sim >= JACCARD_THRESHOLD) {
          group.push(patterns[j]!);
          assigned.add(j);
        }
      }
      if (group.length > 1) {
        const totalOcc = group.reduce((s, p) => s + p.occurrenceCount, 0);
        const primary = group.sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0]!;
        primary.confidence = Math.max(...group.map((p) => jaccard(
          p.stepSignatures, primary.stepSignatures
        )));
        primary.occurrenceCount = totalOcc;
        primary.workflowIds = group.flatMap((p) => p.workflowIds);
        primary.lastSeen = Math.max(...group.map((p) => p.lastSeen));
      }
      merged.push(group[0]!);
    }

    return merged.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }

  /**
   * Detect tasks from conversation history.
   * Splits messages into task segments by 2-hour timeout,
   * then extracts keywords, tools used, and topics per segment.
   */
  detectFromConversation(
    messages: ConversationMessage[],
  ): ConversationDetectedTask[] {
    if (messages.length === 0) return [];

    // Ensure timestamps: default to sequential 1-min spacing
    const now = Date.now();
    const base = messages[0]!.timestamp ?? now;
    const withTs = messages.map((m, i) => ({
      ...m,
      ts: m.timestamp ?? (base + i * 60_000),
    }));

    // Split into segments by 2-hour gap
    const segments: ConversationMessage[][] = [];
    let current: ConversationMessage[] = [withTs[0]!];
    for (let i = 1; i < withTs.length; i++) {
      const prev = withTs[i - 1]!;
      const curr = withTs[i]!;
      if (curr.ts - prev.ts > TWO_HOURS_MS) {
        segments.push(current);
        current = [];
      }
      current.push({ role: curr.role, content: curr.content, timestamp: curr.ts });
    }
    segments.push(current);

    return segments.map((seg, idx) => {
      const allText = seg.map((m) => m.content).join(" ");
      const keywords = extractKeywords(allText);

      const tools = new Set<string>();
      for (const m of seg) {
        if (m.role === "assistant") {
          let match: RegExpExecArray | null;
          const re = new RegExp(TOOL_CALL_RE.source, "g");
          while ((match = re.exec(m.content)) !== null) {
            tools.add(match[1]!.toLowerCase());
          }
        }
      }

      // Topics: top 5 keywords by frequency
      const freq = new Map<string, number>();
      for (const kw of keywords) {
        freq.set(kw, (freq.get(kw) ?? 0) + 1);
      }
      const topics = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => w);

      return {
        id: `conv-task-${idx}-${seg[0]!.timestamp ?? now}`,
        keywords,
        tools: [...tools],
        topics,
        startTime: seg[0]!.timestamp ?? now,
        endTime: seg[seg.length - 1]!.timestamp ?? now,
        messageCount: seg.length,
      };
    });
  }

  /**
   * Recommend a workflow template based on the current user message.
   * Returns the best matching template ID + confidence, or null.
   */
  recommendWorkflow(
    userMessage: string,
    templates?: Array<{ id: string; name: string; description: string; triggers?: string[]; tags?: string[] }>,
  ): WorkflowRecommendation | null {
    const msgTokens = extractKeywords(userMessage);
    if (msgTokens.length === 0) return null;

    // First, check against detected patterns
    const patterns = this.findPatterns();
    let bestPattern: ExtendedTaskPattern | null = null;
    let bestPatternScore = 0;

    for (const p of patterns) {
      const patternTokens = p.stepSignatures.flatMap((s) => extractKeywords(s));
      const sim = jaccard(msgTokens, patternTokens);
      if (sim > bestPatternScore) {
        bestPatternScore = sim;
        bestPattern = p;
      }
    }

    // Then, check against provided templates
    if (templates && templates.length > 0) {
      let bestTemplateId = "";
      let bestTemplateScore = 0;
      let bestTemplateKeywords: string[] = [];

      for (const t of templates) {
        const tTokens = [
          ...extractKeywords(t.name),
          ...extractKeywords(t.description),
          ...(t.triggers?.flatMap((tr) => extractKeywords(tr)) ?? []),
          ...(t.tags?.flatMap((tag) => extractKeywords(tag)) ?? []),
        ];
        const sim = jaccard(msgTokens, tTokens);
        if (sim > bestTemplateScore) {
          bestTemplateScore = sim;
          bestTemplateId = t.id;
          bestTemplateKeywords = msgTokens.filter((tk) => tTokens.includes(tk));
        }
      }

      if (bestTemplateScore >= JACCARD_THRESHOLD) {
        return {
          templateId: bestTemplateId,
          confidence: bestTemplateScore,
          matchedKeywords: bestTemplateKeywords,
        };
      }
    }

    // Fall back to pattern-based recommendation
    if (bestPattern && bestPatternScore >= JACCARD_THRESHOLD) {
      return {
        templateId: bestPattern.id,
        confidence: bestPatternScore,
        matchedKeywords: msgTokens.filter((tk) =>
          bestPattern!.stepSignatures.some((s) => s.includes(tk))
        ),
      };
    }

    return null;
  }

  getHistory(): ReadonlyArray<DetectedTask> {
    return this.taskHistory;
  }

  clearHistory(): void {
    this.taskHistory = [];
  }
}

// Re-export types already exported above
// ExtendedTaskPattern, ConversationDetectedTask, WorkflowRecommendation, ConversationMessage
