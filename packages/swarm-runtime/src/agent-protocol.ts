// ── Core message types ────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type MessageContentType =
  | "text"
  | "code"
  | "diff"
  | "file_reference"
  | "tool_call"
  | "tool_result"
  | "structured";

export interface CodeBlock {
  language: string;
  content: string;
  filePath?: string;
  startLine?: number;
}

export interface FileReference {
  path: string;
  lines?: [number, number];
  content?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  success: boolean;
  output: unknown;
  error?: string;
}

export interface MessageContent {
  type: MessageContentType;
  text?: string;
  code?: CodeBlock;
  diff?: string;
  fileRef?: FileReference;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  structured?: Record<string, unknown>;
}

export interface MessageMetadata {
  expertId?: string;
  model?: string;
  tokenCount?: number;
  latencyMs?: number;
  confidence?: number;
}

export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: MessageContent;
  metadata?: MessageMetadata;
  timestamp: string;
}

// ── Tool definitions (MCP-compatible) ─────────────────────────────────────────

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}

// ── Conversation management ───────────────────────────────────────────────────

export interface ConversationContext {
  systemPrompt: string;
  objective?: string;
  relevantFiles: FileReference[];
  tools: ToolDefinition[];
  maxTokens: number;
}

export interface ConversationConfig {
  model: string;
  temperature: number;
  maxResponseTokens: number;
  stopSequences: string[];
  provider: string;
}

export interface ConversationStats {
  messageCount: number;
  totalTokens: number;
  totalLatencyMs: number;
  toolCallCount: number;
}

export interface AgentConversation {
  id: string;
  messages: AgentMessage[];
  context: ConversationContext;
  config: ConversationConfig;
  stats: ConversationStats;
}

// ── Provider abstraction ──────────────────────────────────────────────────────

export interface LLMProvider {
  name: string;
  sendMessage(conversation: AgentConversation): Promise<AgentMessage>;
  streamMessage?(conversation: AgentConversation): AsyncGenerator<string>;
  getAvailableModels(): string[];
  estimateTokens(text: string): number;
}

export interface ProviderRegistry {
  providers: Map<string, LLMProvider>;
  defaultProvider?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

let idCounter = 0;

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

function now(): string {
  return new Date().toISOString();
}

function emptyStats(): ConversationStats {
  return { messageCount: 0, totalTokens: 0, totalLatencyMs: 0, toolCallCount: 0 };
}

// ── Message creation ──────────────────────────────────────────────────────────

export function createTextMessage(
  role: MessageRole,
  text: string,
  metadata?: MessageMetadata,
): AgentMessage {
  return {
    id: nextId("msg"),
    role,
    content: { type: "text", text },
    metadata,
    timestamp: now(),
  };
}

export function createCodeMessage(
  role: MessageRole,
  code: CodeBlock,
  metadata?: MessageMetadata,
): AgentMessage {
  return {
    id: nextId("msg"),
    role,
    content: { type: "code", code },
    metadata,
    timestamp: now(),
  };
}

export function createDiffMessage(
  role: MessageRole,
  diff: string,
  metadata?: MessageMetadata,
): AgentMessage {
  return {
    id: nextId("msg"),
    role,
    content: { type: "diff", diff },
    metadata,
    timestamp: now(),
  };
}

export function createFileRefMessage(
  role: MessageRole,
  fileRef: FileReference,
  metadata?: MessageMetadata,
): AgentMessage {
  return {
    id: nextId("msg"),
    role,
    content: { type: "file_reference", fileRef },
    metadata,
    timestamp: now(),
  };
}

export function createToolCallMessage(
  toolCall: ToolCall,
  metadata?: MessageMetadata,
): AgentMessage {
  return {
    id: nextId("msg"),
    role: "assistant",
    content: { type: "tool_call", toolCall },
    metadata,
    timestamp: now(),
  };
}

export function createToolResultMessage(
  toolResult: ToolResult,
  metadata?: MessageMetadata,
): AgentMessage {
  return {
    id: nextId("msg"),
    role: "tool",
    content: { type: "tool_result", toolResult },
    metadata,
    timestamp: now(),
  };
}

export function createStructuredMessage(
  role: MessageRole,
  structured: Record<string, unknown>,
  metadata?: MessageMetadata,
): AgentMessage {
  return {
    id: nextId("msg"),
    role,
    content: { type: "structured", structured },
    metadata,
    timestamp: now(),
  };
}

// ── Conversation management ───────────────────────────────────────────────────

export function createConversation(
  context: ConversationContext,
  config: ConversationConfig,
): AgentConversation {
  return {
    id: nextId("conv"),
    messages: [],
    context,
    config,
    stats: emptyStats(),
  };
}

export function addMessage(
  conversation: AgentConversation,
  message: AgentMessage,
): AgentConversation {
  const tokenCount = message.metadata?.tokenCount ?? 0;
  const latencyMs = message.metadata?.latencyMs ?? 0;
  const isToolCall = message.content.type === "tool_call" ? 1 : 0;

  return {
    ...conversation,
    messages: [...conversation.messages, message],
    stats: {
      messageCount: conversation.stats.messageCount + 1,
      totalTokens: conversation.stats.totalTokens + tokenCount,
      totalLatencyMs: conversation.stats.totalLatencyMs + latencyMs,
      toolCallCount: conversation.stats.toolCallCount + isToolCall,
    },
  };
}

export function getLastAssistantMessage(
  conversation: AgentConversation,
): AgentMessage | undefined {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    if (conversation.messages[i]!.role === "assistant") {
      return conversation.messages[i];
    }
  }
  return undefined;
}

export function truncateToTokenLimit(
  conversation: AgentConversation,
  maxTokens: number,
): AgentConversation {
  if (conversation.messages.length === 0) return conversation;

  let totalTokens = 0;
  const kept: AgentMessage[] = [];

  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const msg = conversation.messages[i]!;
    const msgTokens = msg.metadata?.tokenCount ?? estimateMessageTokens(msg);
    if (totalTokens + msgTokens > maxTokens && kept.length > 0) break;
    totalTokens += msgTokens;
    kept.unshift(msg);
  }

  return {
    ...conversation,
    messages: kept,
    stats: {
      ...conversation.stats,
      messageCount: kept.length,
      totalTokens,
    },
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export function createToolDefinition(
  name: string,
  description: string,
  params: Record<string, { type: string; description?: string; required?: boolean }>,
): ToolDefinition {
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  for (const [key, spec] of Object.entries(params)) {
    properties[key] = { type: spec.type, description: spec.description };
    if (spec.required) required.push(key);
  }

  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

export function validateToolCall(
  call: ToolCall,
  definition: ToolDefinition,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (call.name !== definition.name) {
    errors.push(`Tool name mismatch: expected '${definition.name}', got '${call.name}'`);
    return { valid: false, errors };
  }

  const schema = definition.inputSchema;
  if (schema.required) {
    for (const req of schema.required) {
      if (!(req in call.arguments)) {
        errors.push(`Missing required argument: '${req}'`);
      }
    }
  }

  if (schema.properties) {
    for (const key of Object.keys(call.arguments)) {
      if (!(key in schema.properties)) {
        errors.push(`Unknown argument: '${key}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Built-in tool definitions ─────────────────────────────────────────────────

export const BUILT_IN_TOOLS: readonly ToolDefinition[] = Object.freeze([
  createToolDefinition("read_file", "Read the contents of a file", {
    path: { type: "string", description: "File path to read", required: true },
    startLine: { type: "number", description: "Starting line (1-indexed)" },
    endLine: { type: "number", description: "Ending line (1-indexed)" },
  }),
  createToolDefinition("write_file", "Write content to a file", {
    path: { type: "string", description: "File path to write", required: true },
    content: { type: "string", description: "Content to write", required: true },
    createDirs: { type: "boolean", description: "Create parent directories if missing" },
  }),
  createToolDefinition("search_code", "Search for patterns in code files", {
    pattern: { type: "string", description: "Search pattern (regex)", required: true },
    path: { type: "string", description: "Directory to search in" },
    fileGlob: { type: "string", description: "File glob pattern to filter" },
  }),
  createToolDefinition("run_command", "Execute a shell command", {
    command: { type: "string", description: "Command to execute", required: true },
    cwd: { type: "string", description: "Working directory" },
    timeout: { type: "number", description: "Timeout in milliseconds" },
  }),
  createToolDefinition("list_files", "List files in a directory", {
    path: { type: "string", description: "Directory path", required: true },
    recursive: { type: "boolean", description: "List recursively" },
    glob: { type: "string", description: "Glob pattern to filter" },
  }),
]);

// ── Provider registry ─────────────────────────────────────────────────────────

export function createProviderRegistry(): ProviderRegistry {
  return { providers: new Map(), defaultProvider: undefined };
}

export function registerProvider(
  registry: ProviderRegistry,
  provider: LLMProvider,
): ProviderRegistry {
  const providers = new Map(registry.providers);
  providers.set(provider.name, provider);
  return {
    providers,
    defaultProvider: registry.defaultProvider ?? provider.name,
  };
}

export function getProvider(
  registry: ProviderRegistry,
  name: string,
): LLMProvider | undefined {
  return registry.providers.get(name);
}

export function listProviders(registry: ProviderRegistry): string[] {
  return [...registry.providers.keys()];
}

export function getDefaultProvider(
  registry: ProviderRegistry,
): LLMProvider | undefined {
  if (!registry.defaultProvider) return undefined;
  return registry.providers.get(registry.defaultProvider);
}

export function setDefaultProvider(
  registry: ProviderRegistry,
  name: string,
): ProviderRegistry {
  if (!registry.providers.has(name)) {
    throw new Error(`Provider '${name}' not registered`);
  }
  return { ...registry, defaultProvider: name };
}

// ── Mock provider ─────────────────────────────────────────────────────────────

export function createMockProvider(
  responses?: Map<string, string>,
): LLMProvider {
  const defaultResponse = "Mock response";
  const responseMap = responses ?? new Map<string, string>();

  return {
    name: "mock",

    async sendMessage(conversation: AgentConversation): Promise<AgentMessage> {
      const lastUserMsg = [...conversation.messages]
        .reverse()
        .find((m) => m.role === "user");

      const userText = lastUserMsg?.content.text ?? "";
      const responseText = responseMap.get(userText) ?? defaultResponse;

      return createTextMessage("assistant", responseText, {
        model: "mock-model",
        tokenCount: estimateTokens(responseText),
        latencyMs: 1,
      });
    },

    getAvailableModels(): string[] {
      return ["mock-model"];
    },

    estimateTokens(text: string): number {
      return estimateTokens(text);
    },
  };
}

// ── Request/response formatting ───────────────────────────────────────────────

interface OpenAIChatMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIChatMessage[];
  temperature: number;
  max_tokens: number;
  stop?: string[];
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature: number;
  stop_sequences?: string[];
}

function messageToText(msg: AgentMessage): string {
  const c = msg.content;
  switch (c.type) {
    case "text": return c.text ?? "";
    case "code": return c.code ? `\`\`\`${c.code.language}\n${c.code.content}\n\`\`\`` : "";
    case "diff": return c.diff ?? "";
    case "file_reference": return c.fileRef?.content ?? `[File: ${c.fileRef?.path ?? "unknown"}]`;
    case "tool_call": return JSON.stringify(c.toolCall);
    case "tool_result": return typeof c.toolResult?.output === "string" ? c.toolResult.output : JSON.stringify(c.toolResult?.output);
    case "structured": return JSON.stringify(c.structured);
    default: return "";
  }
}

function formatOpenAIMessages(conversation: AgentConversation): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [];

  if (conversation.context.systemPrompt) {
    messages.push({ role: "system", content: conversation.context.systemPrompt });
  }

  for (const msg of conversation.messages) {
    if (msg.content.type === "tool_call" && msg.content.toolCall) {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: msg.content.toolCall.id,
          type: "function",
          function: {
            name: msg.content.toolCall.name,
            arguments: JSON.stringify(msg.content.toolCall.arguments),
          },
        }],
      });
    } else if (msg.content.type === "tool_result" && msg.content.toolResult) {
      messages.push({
        role: "tool",
        content: typeof msg.content.toolResult.output === "string"
          ? msg.content.toolResult.output
          : JSON.stringify(msg.content.toolResult.output),
        tool_call_id: msg.content.toolResult.callId,
      });
    } else {
      messages.push({
        role: msg.role === "tool" ? "user" : msg.role,
        content: messageToText(msg),
      });
    }
  }

  return messages;
}

function formatAnthropicMessages(
  conversation: AgentConversation,
): { system?: string; messages: AnthropicMessage[] } {
  const system = conversation.context.systemPrompt || undefined;
  const messages: AnthropicMessage[] = [];

  for (const msg of conversation.messages) {
    if (msg.role === "system") continue;

    const anthropicRole: "user" | "assistant" =
      msg.role === "assistant" ? "assistant" : "user";

    if (msg.content.type === "tool_call" && msg.content.toolCall) {
      messages.push({
        role: "assistant",
        content: [{
          type: "tool_use",
          id: msg.content.toolCall.id,
          name: msg.content.toolCall.name,
          input: msg.content.toolCall.arguments,
        }],
      });
    } else if (msg.content.type === "tool_result" && msg.content.toolResult) {
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.content.toolResult.callId,
          content: typeof msg.content.toolResult.output === "string"
            ? msg.content.toolResult.output
            : JSON.stringify(msg.content.toolResult.output),
        }],
      });
    } else {
      messages.push({
        role: anthropicRole,
        content: [{ type: "text", text: messageToText(msg) }],
      });
    }
  }

  return { system, messages };
}

export function formatForProvider(
  conversation: AgentConversation,
  provider: string,
): unknown {
  switch (provider) {
    case "openai": {
      const request: OpenAIRequest = {
        model: conversation.config.model,
        messages: formatOpenAIMessages(conversation),
        temperature: conversation.config.temperature,
        max_tokens: conversation.config.maxResponseTokens,
        stop: conversation.config.stopSequences.length > 0
          ? conversation.config.stopSequences
          : undefined,
      };
      return request;
    }

    case "anthropic": {
      const { system, messages } = formatAnthropicMessages(conversation);
      const request: AnthropicRequest = {
        model: conversation.config.model,
        max_tokens: conversation.config.maxResponseTokens,
        system,
        messages,
        temperature: conversation.config.temperature,
        stop_sequences: conversation.config.stopSequences.length > 0
          ? conversation.config.stopSequences
          : undefined,
      };
      return request;
    }

    default: {
      return {
        model: conversation.config.model,
        messages: conversation.messages.map((m) => ({
          role: m.role,
          content: messageToText(m),
        })),
        temperature: conversation.config.temperature,
        maxTokens: conversation.config.maxResponseTokens,
        systemPrompt: conversation.context.systemPrompt,
      };
    }
  }
}

export function parseProviderResponse(
  response: unknown,
  provider: string,
): AgentMessage {
  const resp = response as Record<string, unknown>;

  switch (provider) {
    case "openai": {
      const choices = resp.choices as Array<{
        message: { role: string; content?: string; tool_calls?: Array<{
          id: string; function: { name: string; arguments: string };
        }> };
      }> | undefined;

      const choice = choices?.[0];
      if (!choice) {
        return createTextMessage("assistant", "");
      }

      const msg = choice.message;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const tc = msg.tool_calls[0]!;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* keep empty */ }
        return createToolCallMessage({
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        }, {
          model: resp.model as string | undefined,
          tokenCount: (resp.usage as { total_tokens?: number })?.total_tokens,
        });
      }

      return createTextMessage("assistant", msg.content ?? "", {
        model: resp.model as string | undefined,
        tokenCount: (resp.usage as { total_tokens?: number })?.total_tokens,
      });
    }

    case "anthropic": {
      const content = resp.content as AnthropicContentBlock[] | undefined;
      if (!content || content.length === 0) {
        return createTextMessage("assistant", "");
      }

      const block = content[0]!;
      if (block.type === "tool_use") {
        return createToolCallMessage({
          id: block.id ?? nextId("tc"),
          name: block.name ?? "",
          arguments: (block.input ?? {}) as Record<string, unknown>,
        }, {
          model: resp.model as string | undefined,
        });
      }

      const text = content
        .filter((b): b is AnthropicContentBlock & { type: "text" } => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");

      return createTextMessage("assistant", text, {
        model: resp.model as string | undefined,
      });
    }

    default: {
      const text = typeof resp.content === "string"
        ? resp.content
        : typeof resp.text === "string"
          ? resp.text
          : JSON.stringify(resp);

      return createTextMessage("assistant", text);
    }
  }
}

// ── Token management ──────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateMessageTokens(msg: AgentMessage): number {
  return estimateTokens(messageToText(msg));
}

export function estimateConversationTokens(
  conversation: AgentConversation,
): number {
  let total = estimateTokens(conversation.context.systemPrompt);
  for (const msg of conversation.messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

export function isWithinTokenLimit(
  conversation: AgentConversation,
  limit: number,
): boolean {
  return estimateConversationTokens(conversation) <= limit;
}

export function summarizeForContext(
  messages: AgentMessage[],
  maxTokens: number,
): AgentMessage[] {
  if (messages.length === 0) return [];

  let totalTokens = 0;
  for (const msg of messages) {
    totalTokens += estimateMessageTokens(msg);
  }

  if (totalTokens <= maxTokens) return [...messages];

  const toSummarize = messages.slice(0, -2);
  const toKeep = messages.slice(-2);

  if (toSummarize.length === 0) return [...toKeep];

  const summaryParts: string[] = [];
  for (const msg of toSummarize) {
    const text = messageToText(msg);
    const truncated = text.length > 200 ? text.slice(0, 197) + "..." : text;
    summaryParts.push(`[${msg.role}]: ${truncated}`);
  }

  const summaryText = `[Conversation summary - ${toSummarize.length} messages condensed]\n${summaryParts.join("\n")}`;

  const targetSummaryTokens = maxTokens - toKeep.reduce((t, m) => t + estimateMessageTokens(m), 0);
  const finalSummary = targetSummaryTokens > 0 && estimateTokens(summaryText) > targetSummaryTokens
    ? summaryText.slice(0, targetSummaryTokens * CHARS_PER_TOKEN)
    : summaryText;

  const summaryMessage = createTextMessage("system", finalSummary);
  return [summaryMessage, ...toKeep];
}
