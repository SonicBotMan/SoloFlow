/**
 * Type stubs for openclaw/plugin-sdk/plugin-entry
 *
 * Allows TypeScript compilation without the full OpenClaw package.
 * Only surfaces actually used by SoloFlow are declared.
 */

export interface PluginLogger {
  debug?(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface OpenClawPluginApi {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  rootDir?: string;
  logger: PluginLogger;
  config: Record<string, unknown>;
  pluginConfig?: Record<string, unknown>;
  runtime: {
    subagent: {
      run: (opts: {
        sessionKey: string;
        message: string;
        provider?: string;
        model?: string;
        deliver?: boolean;
        timeoutMs?: number;
        idempotencyKey?: string;
      }) => Promise<{ runId: string }>;
      waitForRun: (opts: {
        runId: string;
        timeoutMs?: number;
      }) => Promise<{ result?: string; error?: string }>;
      getSessionMessages: (opts: {
        sessionKey: string;
        limit?: number;
      }) => Promise<{ messages: Array<{ role: string; content: string }> }>;
      deleteSession: (opts: { sessionKey: string }) => Promise<void>;
    };
    agent: {
      defaults: {
        model: string;
        provider: string;
      };
    };
  };
  /** Host model provider config for direct LLM calls. */
  hostModels?: Record<string, unknown>;
  config: Record<string, unknown>;
  registerTool(tool: unknown, opts?: { optional?: boolean }): void;
  registerHook(events: string | string[], handler: unknown, opts?: unknown): void;
  registerHttpRoute(params: unknown): void;
  registerChannel(registration: unknown): void;
  registerGatewayMethod(
    method: string,
    handler: (opts: {
      respond: (ok: boolean, payload?: unknown, error?: unknown, meta?: unknown) => void;
      req: unknown;
      params: Record<string, unknown>;
      context: unknown;
    }) => void | Promise<void>,
    opts?: unknown,
  ): void;
  registerCli(registrar: unknown, opts?: unknown): void;
  registerReload(registration: unknown): void;
  registerNodeHostCommand(command: unknown): void;
  registerSecurityAuditCollector(collector: unknown): void;
  registerService(service: unknown): void;
  registerConfigMigration(migrate: unknown): void;
  registerAutoEnableProbe(probe: unknown): void;
  registerProvider(provider: unknown): void;
  registerSpeechProvider(provider: unknown): void;
  registerRealtimeTranscriptionProvider(provider: unknown): void;
  registerRealtimeVoiceProvider(provider: unknown): void;
  registerMediaUnderstandingProvider(provider: unknown): void;
  registerImageGenerationProvider(provider: unknown): void;
  registerVideoGenerationProvider(provider: unknown): void;
  registerMusicGenerationProvider(provider: unknown): void;
  registerWebFetchProvider(provider: unknown): void;
  registerWebSearchProvider(provider: unknown): void;
  registerCommand(command: unknown): void;
  registerContextEngine(id: string, factory: unknown): void;
  registerMemoryPromptSection(builder: unknown): void;
  registerMemoryFlushPlan(resolver: unknown): void;
  registerMemoryRuntime(runtime: unknown): void;
  registerMemoryEmbeddingProvider(adapter: unknown): void;
  registerInteractiveHandler(registration: unknown): void;
  onConversationBindingResolved(handler: (event: unknown) => void | Promise<void>): void;
}

export interface OpenClawPluginConfigSchema {
  type: string;
  properties?: Record<string, unknown>;
  additionalProperties?: boolean;
  required?: string[];
}

export declare const emptyPluginConfigSchema: OpenClawPluginConfigSchema;

export declare function definePluginEntry(opts: {
  id: string;
  name: string;
  description: string;
  kind?: string;
  configSchema?: OpenClawPluginConfigSchema | (() => OpenClawPluginConfigSchema);
  reload?: unknown;
  nodeHostCommands?: unknown;
  securityAuditCollectors?: unknown;
  register: (api: OpenClawPluginApi) => void;
}): unknown;
