import { describe, test, expect } from "bun:test";
import {
  createTextMessage,
  createCodeMessage,
  createDiffMessage,
  createFileRefMessage,
  createToolCallMessage,
  createToolResultMessage,
  createStructuredMessage,
  createConversation,
  addMessage,
  getLastAssistantMessage,
  truncateToTokenLimit,
  createToolDefinition,
  validateToolCall,
  BUILT_IN_TOOLS,
  createProviderRegistry,
  registerProvider,
  getProvider,
  listProviders,
  getDefaultProvider,
  setDefaultProvider,
  createMockProvider,
  formatForProvider,
  parseProviderResponse,
  estimateTokens,
  estimateConversationTokens,
  isWithinTokenLimit,
  summarizeForContext,
} from "./agent-protocol.js";
import type {
  AgentConversation,
  ConversationContext,
  ConversationConfig,
  ToolCall,
  ToolDefinition,
  LLMProvider,
  AgentMessage,
} from "./agent-protocol.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<ConversationContext>): ConversationContext {
  return {
    systemPrompt: "You are a helpful assistant.",
    relevantFiles: [],
    tools: [],
    maxTokens: 4096,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<ConversationConfig>): ConversationConfig {
  return {
    model: "gpt-4",
    temperature: 0.7,
    maxResponseTokens: 1024,
    stopSequences: [],
    provider: "openai",
    ...overrides,
  };
}

function makeConversationWithMessages(count: number): AgentConversation {
  let conv = createConversation(makeContext(), makeConfig());
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    conv = addMessage(conv, createTextMessage(role as "user" | "assistant", `Message ${i}`, { tokenCount: 50 }));
  }
  return conv;
}

// ── Message creation ─────────────────────────────────────────────────────────

describe("Message creation", () => {
  test("createTextMessage creates a text message with correct fields", () => {
    const msg = createTextMessage("user", "Hello");
    expect(msg.role).toBe("user");
    expect(msg.content.type).toBe("text");
    expect(msg.content.text).toBe("Hello");
    expect(msg.id).toMatch(/^msg-/);
    expect(msg.timestamp).toBeTruthy();
  });

  test("createTextMessage includes metadata when provided", () => {
    const msg = createTextMessage("assistant", "Hi", { model: "gpt-4", tokenCount: 5 });
    expect(msg.metadata?.model).toBe("gpt-4");
    expect(msg.metadata?.tokenCount).toBe(5);
  });

  test("createCodeMessage creates a code content message", () => {
    const code = { language: "typescript", content: "const x = 1;", filePath: "test.ts", startLine: 1 };
    const msg = createCodeMessage("assistant", code);
    expect(msg.content.type).toBe("code");
    expect(msg.content.code).toEqual(code);
  });

  test("createDiffMessage creates a diff content message", () => {
    const diff = "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new";
    const msg = createDiffMessage("assistant", diff);
    expect(msg.content.type).toBe("diff");
    expect(msg.content.diff).toBe(diff);
  });

  test("createFileRefMessage creates a file reference message", () => {
    const fileRef = { path: "src/index.ts", lines: [1, 10] as [number, number], content: "code" };
    const msg = createFileRefMessage("assistant", fileRef);
    expect(msg.content.type).toBe("file_reference");
    expect(msg.content.fileRef).toEqual(fileRef);
  });

  test("createToolCallMessage is always role=assistant", () => {
    const tc = { id: "tc-1", name: "read_file", arguments: { path: "test.ts" } };
    const msg = createToolCallMessage(tc);
    expect(msg.role).toBe("assistant");
    expect(msg.content.type).toBe("tool_call");
    expect(msg.content.toolCall).toEqual(tc);
  });

  test("createToolResultMessage is always role=tool", () => {
    const tr = { callId: "tc-1", success: true, output: "file contents" };
    const msg = createToolResultMessage(tr);
    expect(msg.role).toBe("tool");
    expect(msg.content.type).toBe("tool_result");
    expect(msg.content.toolResult).toEqual(tr);
  });

  test("createStructuredMessage creates structured content", () => {
    const data = { analysis: "ok", score: 95 };
    const msg = createStructuredMessage("assistant", data);
    expect(msg.content.type).toBe("structured");
    expect(msg.content.structured).toEqual(data);
  });

  test("each message gets a unique id", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      ids.add(createTextMessage("user", `msg ${i}`).id);
    }
    expect(ids.size).toBe(20);
  });

  test("messages have ISO timestamps", () => {
    const msg = createTextMessage("user", "test");
    expect(() => new Date(msg.timestamp)).not.toThrow();
    expect(new Date(msg.timestamp).toISOString()).toBe(msg.timestamp);
  });
});

// ── Conversation management ──────────────────────────────────────────────────

describe("Conversation management", () => {
  test("createConversation initializes empty conversation", () => {
    const conv = createConversation(makeContext(), makeConfig());
    expect(conv.id).toMatch(/^conv-/);
    expect(conv.messages).toHaveLength(0);
    expect(conv.stats.messageCount).toBe(0);
    expect(conv.stats.totalTokens).toBe(0);
    expect(conv.stats.totalLatencyMs).toBe(0);
    expect(conv.stats.toolCallCount).toBe(0);
  });

  test("addMessage appends message immutably", () => {
    const conv = createConversation(makeContext(), makeConfig());
    const msg = createTextMessage("user", "Hello");
    const updated = addMessage(conv, msg);

    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0]).toBe(msg);
    expect(conv.messages).toHaveLength(0);
  });

  test("addMessage updates stats with token count and latency", () => {
    const conv = createConversation(makeContext(), makeConfig());
    const msg = createTextMessage("user", "Hello", { tokenCount: 10, latencyMs: 50 });
    const updated = addMessage(conv, msg);

    expect(updated.stats.messageCount).toBe(1);
    expect(updated.stats.totalTokens).toBe(10);
    expect(updated.stats.totalLatencyMs).toBe(50);
  });

  test("addMessage increments toolCallCount for tool_call messages", () => {
    const conv = createConversation(makeContext(), makeConfig());
    const tc = createToolCallMessage({ id: "tc-1", name: "read_file", arguments: {} });
    const updated = addMessage(conv, tc);

    expect(updated.stats.toolCallCount).toBe(1);
  });

  test("addMessage handles messages without metadata gracefully", () => {
    const conv = createConversation(makeContext(), makeConfig());
    const msg = createTextMessage("user", "Hello");
    const updated = addMessage(conv, msg);

    expect(updated.stats.totalTokens).toBe(0);
    expect(updated.stats.totalLatencyMs).toBe(0);
  });

  test("getLastAssistantMessage returns the last assistant message", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createTextMessage("user", "Hello"));
    conv = addMessage(conv, createTextMessage("assistant", "Hi"));
    conv = addMessage(conv, createTextMessage("user", "How are you?"));
    conv = addMessage(conv, createTextMessage("assistant", "Good"));

    const last = getLastAssistantMessage(conv);
    expect(last).toBeDefined();
    expect(last!.content.text).toBe("Good");
  });

  test("getLastAssistantMessage returns undefined for empty conversation", () => {
    const conv = createConversation(makeContext(), makeConfig());
    expect(getLastAssistantMessage(conv)).toBeUndefined();
  });

  test("getLastAssistantMessage returns undefined when no assistant messages exist", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createTextMessage("user", "Hello"));
    conv = addMessage(conv, createTextMessage("user", "Still here?"));

    expect(getLastAssistantMessage(conv)).toBeUndefined();
  });

  test("truncateToTokenLimit keeps most recent messages within budget", () => {
    const conv = makeConversationWithMessages(10);
    const truncated = truncateToTokenLimit(conv, 200);

    expect(truncated.messages.length).toBeLessThanOrEqual(conv.messages.length);
    expect(truncated.stats.totalTokens).toBeLessThanOrEqual(200);
    const lastOriginal = conv.messages[conv.messages.length - 1]!;
    const lastTruncated = truncated.messages[truncated.messages.length - 1]!;
    expect(lastTruncated.id).toBe(lastOriginal.id);
  });

  test("truncateToTokenLimit returns same conversation if within limit", () => {
    const conv = makeConversationWithMessages(2);
    const truncated = truncateToTokenLimit(conv, 10000);
    expect(truncated.messages).toHaveLength(2);
  });

  test("truncateToTokenLimit handles empty conversations", () => {
    const conv = createConversation(makeContext(), makeConfig());
    const truncated = truncateToTokenLimit(conv, 100);
    expect(truncated.messages).toHaveLength(0);
  });

  test("truncateToTokenLimit always keeps at least one message", () => {
    const conv = makeConversationWithMessages(5);
    const truncated = truncateToTokenLimit(conv, 1);
    expect(truncated.messages.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Tool definitions ─────────────────────────────────────────────────────────

describe("Tool definitions", () => {
  test("createToolDefinition creates a valid tool definition", () => {
    const def = createToolDefinition("test_tool", "A test tool", {
      input: { type: "string", description: "The input", required: true },
      verbose: { type: "boolean", description: "Verbose mode" },
    });

    expect(def.name).toBe("test_tool");
    expect(def.description).toBe("A test tool");
    expect(def.inputSchema.type).toBe("object");
    expect(def.inputSchema.properties?.input?.type).toBe("string");
    expect(def.inputSchema.required).toEqual(["input"]);
  });

  test("createToolDefinition omits required array when no params are required", () => {
    const def = createToolDefinition("optional_tool", "All optional", {
      flag: { type: "boolean" },
    });
    expect(def.inputSchema.required).toBeUndefined();
  });

  test("validateToolCall passes for valid calls", () => {
    const def = createToolDefinition("read_file", "Read a file", {
      path: { type: "string", required: true },
    });
    const call: ToolCall = { id: "tc-1", name: "read_file", arguments: { path: "test.ts" } };

    const result = validateToolCall(call, def);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("validateToolCall rejects name mismatch", () => {
    const def = createToolDefinition("read_file", "Read a file", {
      path: { type: "string", required: true },
    });
    const call: ToolCall = { id: "tc-1", name: "wrong_name", arguments: { path: "test.ts" } };

    const result = validateToolCall(call, def);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("name mismatch");
  });

  test("validateToolCall detects missing required arguments", () => {
    const def = createToolDefinition("read_file", "Read a file", {
      path: { type: "string", required: true },
      encoding: { type: "string", required: true },
    });
    const call: ToolCall = { id: "tc-1", name: "read_file", arguments: {} };

    const result = validateToolCall(call, def);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
    expect(result.errors.some((e) => e.includes("path"))).toBe(true);
    expect(result.errors.some((e) => e.includes("encoding"))).toBe(true);
  });

  test("validateToolCall detects unknown arguments", () => {
    const def = createToolDefinition("read_file", "Read a file", {
      path: { type: "string", required: true },
    });
    const call: ToolCall = { id: "tc-1", name: "read_file", arguments: { path: "test.ts", bogus: true } };

    const result = validateToolCall(call, def);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unknown argument");
  });

  test("BUILT_IN_TOOLS contains expected tool definitions", () => {
    const names = BUILT_IN_TOOLS.map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("search_code");
    expect(names).toContain("run_command");
    expect(names).toContain("list_files");
  });

  test("BUILT_IN_TOOLS are frozen", () => {
    expect(Object.isFrozen(BUILT_IN_TOOLS)).toBe(true);
  });
});

// ── Provider registry ────────────────────────────────────────────────────────

describe("Provider registry", () => {
  test("createProviderRegistry starts empty", () => {
    const registry = createProviderRegistry();
    expect(listProviders(registry)).toHaveLength(0);
    expect(registry.defaultProvider).toBeUndefined();
  });

  test("registerProvider adds a provider and sets first as default", () => {
    const registry = createProviderRegistry();
    const mock = createMockProvider();
    const updated = registerProvider(registry, mock);

    expect(listProviders(updated)).toEqual(["mock"]);
    expect(updated.defaultProvider).toBe("mock");
  });

  test("registerProvider preserves existing default", () => {
    let registry = createProviderRegistry();
    const mock1 = createMockProvider();
    const mock2: LLMProvider = { ...createMockProvider(), name: "second" };

    registry = registerProvider(registry, mock1);
    registry = registerProvider(registry, mock2);

    expect(registry.defaultProvider).toBe("mock");
    expect(listProviders(registry)).toContain("second");
  });

  test("getProvider returns registered provider", () => {
    let registry = createProviderRegistry();
    const mock = createMockProvider();
    registry = registerProvider(registry, mock);

    expect(getProvider(registry, "mock")).toBe(mock);
  });

  test("getProvider returns undefined for unknown provider", () => {
    const registry = createProviderRegistry();
    expect(getProvider(registry, "nonexistent")).toBeUndefined();
  });

  test("getDefaultProvider returns the default", () => {
    let registry = createProviderRegistry();
    registry = registerProvider(registry, createMockProvider());
    expect(getDefaultProvider(registry)?.name).toBe("mock");
  });

  test("getDefaultProvider returns undefined when empty", () => {
    const registry = createProviderRegistry();
    expect(getDefaultProvider(registry)).toBeUndefined();
  });

  test("setDefaultProvider changes the default", () => {
    let registry = createProviderRegistry();
    registry = registerProvider(registry, createMockProvider());
    registry = registerProvider(registry, { ...createMockProvider(), name: "other" });
    registry = setDefaultProvider(registry, "other");
    expect(registry.defaultProvider).toBe("other");
  });

  test("setDefaultProvider throws for unknown provider", () => {
    const registry = createProviderRegistry();
    expect(() => setDefaultProvider(registry, "nope")).toThrow("not registered");
  });

  test("listProviders returns all registered names", () => {
    let registry = createProviderRegistry();
    registry = registerProvider(registry, createMockProvider());
    registry = registerProvider(registry, { ...createMockProvider(), name: "alpha" });
    registry = registerProvider(registry, { ...createMockProvider(), name: "beta" });

    const names = listProviders(registry);
    expect(names).toContain("mock");
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });

  test("registerProvider is immutable", () => {
    const original = createProviderRegistry();
    const updated = registerProvider(original, createMockProvider());
    expect(listProviders(original)).toHaveLength(0);
    expect(listProviders(updated)).toHaveLength(1);
  });
});

// ── Mock provider ────────────────────────────────────────────────────────────

describe("Mock provider", () => {
  test("returns default response for unknown input", async () => {
    const mock = createMockProvider();
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createTextMessage("user", "anything"));

    const response = await mock.sendMessage(conv);
    expect(response.role).toBe("assistant");
    expect(response.content.text).toBe("Mock response");
  });

  test("returns configured response for matching input", async () => {
    const responses = new Map([["hello", "world"]]);
    const mock = createMockProvider(responses);
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createTextMessage("user", "hello"));

    const response = await mock.sendMessage(conv);
    expect(response.content.text).toBe("world");
  });

  test("getAvailableModels returns mock model", () => {
    const mock = createMockProvider();
    expect(mock.getAvailableModels()).toEqual(["mock-model"]);
  });

  test("estimateTokens delegates to the global estimator", () => {
    const mock = createMockProvider();
    expect(mock.estimateTokens("hello world")).toBe(estimateTokens("hello world"));
  });

  test("response includes metadata", async () => {
    const mock = createMockProvider();
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createTextMessage("user", "test"));

    const response = await mock.sendMessage(conv);
    expect(response.metadata?.model).toBe("mock-model");
    expect(response.metadata?.latencyMs).toBe(1);
    expect(typeof response.metadata?.tokenCount).toBe("number");
  });
});

// ── Format conversion ────────────────────────────────────────────────────────

describe("Format conversion", () => {
  test("formatForProvider produces OpenAI format", () => {
    let conv = createConversation(makeContext(), makeConfig({ provider: "openai", model: "gpt-4" }));
    conv = addMessage(conv, createTextMessage("user", "Hello"));

    const result = formatForProvider(conv, "openai") as {
      model: string;
      messages: Array<{ role: string; content: string | null }>;
      temperature: number;
      max_tokens: number;
    };

    expect(result.model).toBe("gpt-4");
    expect(result.messages[0]!.role).toBe("system");
    expect(result.messages[1]!.role).toBe("user");
    expect(result.messages[1]!.content).toBe("Hello");
    expect(result.temperature).toBe(0.7);
    expect(result.max_tokens).toBe(1024);
  });

  test("formatForProvider produces Anthropic format", () => {
    let conv = createConversation(makeContext(), makeConfig({ provider: "anthropic", model: "claude-3" }));
    conv = addMessage(conv, createTextMessage("user", "Hello"));

    const result = formatForProvider(conv, "anthropic") as {
      model: string;
      system?: string;
      messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
      max_tokens: number;
    };

    expect(result.model).toBe("claude-3");
    expect(result.system).toBe("You are a helpful assistant.");
    expect(result.messages[0]!.role).toBe("user");
    expect(result.messages[0]!.content[0]!.text).toBe("Hello");
  });

  test("formatForProvider produces generic format for unknown providers", () => {
    let conv = createConversation(makeContext(), makeConfig({ provider: "local" }));
    conv = addMessage(conv, createTextMessage("user", "Hello"));

    const result = formatForProvider(conv, "local") as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      systemPrompt: string;
    };

    expect(result.systemPrompt).toBe("You are a helpful assistant.");
    expect(result.messages[0]!.content).toBe("Hello");
  });

  test("formatForProvider handles tool_call messages for OpenAI", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createToolCallMessage({
      id: "tc-1", name: "read_file", arguments: { path: "test.ts" },
    }));

    const result = formatForProvider(conv, "openai") as {
      messages: Array<{ role: string; content: string | null; tool_calls?: unknown[] }>;
    };

    const assistantMsg = result.messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBeNull();
    expect(assistantMsg!.tool_calls).toHaveLength(1);
  });

  test("formatForProvider handles tool_result messages for OpenAI", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createToolResultMessage({
      callId: "tc-1", success: true, output: "file contents",
    }));

    const result = formatForProvider(conv, "openai") as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };

    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.tool_call_id).toBe("tc-1");
    expect(toolMsg!.content).toBe("file contents");
  });

  test("formatForProvider handles tool_use for Anthropic", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createToolCallMessage({
      id: "tc-1", name: "search_code", arguments: { pattern: "TODO" },
    }));

    const result = formatForProvider(conv, "anthropic") as {
      messages: Array<{
        role: string;
        content: Array<{ type: string; id?: string; name?: string; input?: unknown }>;
      }>;
    };

    const assistantMsg = result.messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content[0]!.type).toBe("tool_use");
    expect(assistantMsg!.content[0]!.name).toBe("search_code");
  });

  test("formatForProvider omits stop when empty", () => {
    const conv = createConversation(makeContext(), makeConfig({ stopSequences: [] }));
    const result = formatForProvider(conv, "openai") as { stop?: string[] };
    expect(result.stop).toBeUndefined();
  });

  test("formatForProvider includes stop sequences when present", () => {
    const conv = createConversation(makeContext(), makeConfig({ stopSequences: ["END", "STOP"] }));
    const result = formatForProvider(conv, "openai") as { stop?: string[] };
    expect(result.stop).toEqual(["END", "STOP"]);
  });

  test("parseProviderResponse parses OpenAI text response", () => {
    const openaiResponse = {
      choices: [{ message: { role: "assistant", content: "Hello world" } }],
      model: "gpt-4",
      usage: { total_tokens: 15 },
    };

    const msg = parseProviderResponse(openaiResponse, "openai");
    expect(msg.role).toBe("assistant");
    expect(msg.content.text).toBe("Hello world");
    expect(msg.metadata?.model).toBe("gpt-4");
    expect(msg.metadata?.tokenCount).toBe(15);
  });

  test("parseProviderResponse parses OpenAI tool_call response", () => {
    const openaiResponse = {
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_123",
            function: { name: "read_file", arguments: '{"path":"test.ts"}' },
          }],
        },
      }],
      model: "gpt-4",
    };

    const msg = parseProviderResponse(openaiResponse, "openai");
    expect(msg.content.type).toBe("tool_call");
    expect(msg.content.toolCall?.name).toBe("read_file");
    expect(msg.content.toolCall?.arguments).toEqual({ path: "test.ts" });
  });

  test("parseProviderResponse parses Anthropic text response", () => {
    const anthropicResponse = {
      content: [{ type: "text", text: "Hello from Claude" }],
      model: "claude-3-opus",
    };

    const msg = parseProviderResponse(anthropicResponse, "anthropic");
    expect(msg.role).toBe("assistant");
    expect(msg.content.text).toBe("Hello from Claude");
    expect(msg.metadata?.model).toBe("claude-3-opus");
  });

  test("parseProviderResponse parses Anthropic tool_use response", () => {
    const anthropicResponse = {
      content: [{
        type: "tool_use",
        id: "toolu_123",
        name: "read_file",
        input: { path: "test.ts" },
      }],
      model: "claude-3-opus",
    };

    const msg = parseProviderResponse(anthropicResponse, "anthropic");
    expect(msg.content.type).toBe("tool_call");
    expect(msg.content.toolCall?.name).toBe("read_file");
  });

  test("parseProviderResponse handles empty OpenAI response", () => {
    const msg = parseProviderResponse({ choices: [] }, "openai");
    expect(msg.role).toBe("assistant");
    expect(msg.content.text).toBe("");
  });

  test("parseProviderResponse handles empty Anthropic response", () => {
    const msg = parseProviderResponse({ content: [] }, "anthropic");
    expect(msg.role).toBe("assistant");
    expect(msg.content.text).toBe("");
  });

  test("parseProviderResponse handles unknown provider format", () => {
    const msg = parseProviderResponse({ content: "Hello from local" }, "local");
    expect(msg.content.text).toBe("Hello from local");
  });

  test("parseProviderResponse handles generic object for unknown provider", () => {
    const msg = parseProviderResponse({ text: "fallback text" }, "unknown");
    expect(msg.content.text).toBe("fallback text");
  });
});

// ── Token estimation ─────────────────────────────────────────────────────────

describe("Token estimation", () => {
  test("estimateTokens returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("estimateTokens provides rough estimate based on character count", () => {
    const tokens = estimateTokens("Hello, world!");
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100);
  });

  test("estimateTokens scales with text length", () => {
    const short = estimateTokens("hi");
    const long = estimateTokens("This is a much longer piece of text that should result in more tokens");
    expect(long).toBeGreaterThan(short);
  });

  test("estimateConversationTokens includes system prompt", () => {
    const conv = createConversation(
      makeContext({ systemPrompt: "Be helpful" }),
      makeConfig(),
    );
    const tokens = estimateConversationTokens(conv);
    expect(tokens).toBeGreaterThan(0);
  });

  test("estimateConversationTokens sums all messages", () => {
    let conv = createConversation(makeContext({ systemPrompt: "" }), makeConfig());
    conv = addMessage(conv, createTextMessage("user", "Hello"));
    conv = addMessage(conv, createTextMessage("assistant", "Hi there"));

    const tokens = estimateConversationTokens(conv);
    expect(tokens).toBe(estimateTokens("Hello") + estimateTokens("Hi there"));
  });

  test("isWithinTokenLimit returns true when under limit", () => {
    const conv = createConversation(makeContext({ systemPrompt: "Hi" }), makeConfig());
    expect(isWithinTokenLimit(conv, 10000)).toBe(true);
  });

  test("isWithinTokenLimit returns false when over limit", () => {
    let conv = createConversation(makeContext({ systemPrompt: "A".repeat(1000) }), makeConfig());
    conv = addMessage(conv, createTextMessage("user", "B".repeat(1000)));
    expect(isWithinTokenLimit(conv, 10)).toBe(false);
  });
});

// ── Context summarization ────────────────────────────────────────────────────

describe("Context summarization", () => {
  test("returns empty array for empty messages", () => {
    expect(summarizeForContext([], 100)).toHaveLength(0);
  });

  test("returns messages as-is when within token budget", () => {
    const messages = [
      createTextMessage("user", "Hi"),
      createTextMessage("assistant", "Hello"),
    ];
    const result = summarizeForContext(messages, 100000);
    expect(result).toHaveLength(2);
  });

  test("condenses older messages when over budget", () => {
    const messages: AgentMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(createTextMessage(
        i % 2 === 0 ? "user" : "assistant",
        `This is message number ${i} with some extra text to increase token count`,
      ));
    }

    const result = summarizeForContext(messages, 100);
    expect(result.length).toBeLessThan(messages.length);
    expect(result[0]!.content.text).toContain("Conversation summary");
  });

  test("preserves the last two messages", () => {
    const messages: AgentMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(createTextMessage("user", `Message ${i} `.repeat(20)));
    }

    const result = summarizeForContext(messages, 200);
    const lastOriginal = messages[messages.length - 1]!;
    const lastResult = result[result.length - 1]!;
    expect(lastResult.id).toBe(lastOriginal.id);
  });

  test("summary message has system role", () => {
    const messages: AgentMessage[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(createTextMessage("user", "x".repeat(500)));
    }

    const result = summarizeForContext(messages, 200);
    expect(result[0]!.role).toBe("system");
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  test("empty conversation formats correctly for all providers", () => {
    const conv = createConversation(makeContext(), makeConfig());

    const openai = formatForProvider(conv, "openai") as { messages: unknown[] };
    expect(openai.messages).toHaveLength(1);

    const anthropic = formatForProvider(conv, "anthropic") as { messages: unknown[] };
    expect(anthropic.messages).toHaveLength(0);

    const generic = formatForProvider(conv, "generic") as { messages: unknown[] };
    expect(generic.messages).toHaveLength(0);
  });

  test("invalid tool calls are detected", () => {
    const def = createToolDefinition("my_tool", "Test", {
      required_param: { type: "string", required: true },
    });
    const call: ToolCall = { id: "tc-1", name: "my_tool", arguments: { wrong_param: "value" } };

    const result = validateToolCall(call, def);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  test("parseProviderResponse handles malformed OpenAI tool_call arguments", () => {
    const response = {
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_123",
            function: { name: "test", arguments: "not valid json {{{" },
          }],
        },
      }],
    };

    const msg = parseProviderResponse(response, "openai");
    expect(msg.content.type).toBe("tool_call");
    expect(msg.content.toolCall?.arguments).toEqual({});
  });

  test("conversation with code messages formats correctly", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createCodeMessage("assistant", {
      language: "typescript",
      content: "const x = 1;",
    }));

    const result = formatForProvider(conv, "openai") as {
      messages: Array<{ content: string | null }>;
    };

    const assistantMsg = result.messages.find((m) => (m as { role: string }).role === "assistant");
    expect(assistantMsg?.content).toContain("```typescript");
    expect(assistantMsg?.content).toContain("const x = 1;");
  });

  test("tool result with non-string output serializes correctly", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createToolResultMessage({
      callId: "tc-1",
      success: true,
      output: { files: ["a.ts", "b.ts"], count: 2 },
    }));

    const result = formatForProvider(conv, "openai") as {
      messages: Array<{ role: string; content: string }>;
    };
    const toolMsg = result.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    const parsed = JSON.parse(toolMsg!.content);
    expect(parsed.files).toEqual(["a.ts", "b.ts"]);
  });

  test("file reference message without content uses path placeholder", () => {
    const msg = createFileRefMessage("assistant", { path: "src/main.ts" });
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, msg);

    const result = formatForProvider(conv, "openai") as {
      messages: Array<{ content: string | null }>;
    };
    const assistantMsg = result.messages.find((m) => (m as { role: string }).role === "assistant");
    expect(assistantMsg?.content).toContain("src/main.ts");
  });

  test("multiple built-in tools have valid schemas", () => {
    for (const tool of BUILT_IN_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  test("structured message round-trips through formatForProvider", () => {
    let conv = createConversation(makeContext(), makeConfig());
    conv = addMessage(conv, createStructuredMessage("assistant", { status: "ok", items: [1, 2, 3] }));

    const result = formatForProvider(conv, "openai") as {
      messages: Array<{ role: string; content: string | null }>;
    };
    const msg = result.messages.find((m) => m.role === "assistant");
    expect(msg).toBeDefined();
    const parsed = JSON.parse(msg!.content!);
    expect(parsed.status).toBe("ok");
    expect(parsed.items).toEqual([1, 2, 3]);
  });
});
