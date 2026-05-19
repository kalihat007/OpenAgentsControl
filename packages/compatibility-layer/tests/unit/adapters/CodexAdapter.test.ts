import { describe, it, expect, beforeEach } from "vitest";
import { CodexAdapter } from "../../../src/adapters/CodexAdapter";
import type { OpenAgent } from "../../../src/types";

describe("CodexAdapter", () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    adapter = new CodexAdapter();
  });

  // ============================================================================
  // ADAPTER IDENTITY
  // ============================================================================

  describe("adapter identity", () => {
    it("has correct name", () => {
      expect(adapter.name).toBe("codex");
    });

    it("has correct displayName", () => {
      expect(adapter.displayName).toBe("Codex CLI");
    });

    it("returns correct config path", () => {
      expect(adapter.getConfigPath()).toBe(".codex/agents/openagents-control/");
    });
  });

  // ============================================================================
  // CAPABILITIES
  // ============================================================================

  describe("getCapabilities()", () => {
    it("returns correct capabilities object", () => {
      const capabilities = adapter.getCapabilities();

      expect(capabilities.name).toBe("codex");
      expect(capabilities.displayName).toBe("Codex CLI");
      expect(capabilities.supportsMultipleAgents).toBe(false);
      expect(capabilities.supportsSkills).toBe(false);
      expect(capabilities.supportsHooks).toBe(false);
      expect(capabilities.supportsGranularPermissions).toBe(false);
      expect(capabilities.supportsContexts).toBe(false);
      expect(capabilities.supportsCustomModels).toBe(false);
      expect(capabilities.supportsTemperature).toBe(false);
      expect(capabilities.supportsMaxSteps).toBe(false);
      expect(capabilities.configFormat).toBe("plain");
      expect(capabilities.outputStructure).toBe("single-file");
    });

    it("includes appropriate notes", () => {
      const capabilities = adapter.getCapabilities();

      expect(capabilities.notes).toBeDefined();
      expect(capabilities.notes?.length).toBeGreaterThan(0);
      expect(capabilities.notes?.some((n) => n.includes("TOML"))).toBe(true);
    });
  });

  // ============================================================================
  // toOAC() - PARSING CODEX TOML
  // ============================================================================

  describe("toOAC() - parsing Codex TOML", () => {
    it("parses minimal TOML", async () => {
      const source = `name = "TestAgent"\ndescription = """\nTest description\n"""\n\ndeveloper_instructions = """\nYou are helpful\n"""`;

      const result = await adapter.toOAC(source);

      expect(result.frontmatter.name).toBe("TestAgent");
      expect(result.frontmatter.description).toBe("Test description");
      expect(result.systemPrompt).toBe("You are helpful");
      expect(result.frontmatter.mode).toBe("primary");
    });

    it("parses TOML with nickname_candidates", async () => {
      const source = `name = "OpenAgent"\ndescription = """\nQuest lead\n"""\nnickname_candidates = ["Quest Lead", "Team Lead"]\n\ndeveloper_instructions = """\nFollow Quest v8\n"""`;

      const result = await adapter.toOAC(source);

      expect(result.frontmatter.name).toBe("OpenAgent");
      expect(result.systemPrompt).toBe("Follow Quest v8");
    });

    it("handles missing fields gracefully", async () => {
      const source = `name = "MinimalAgent"`;

      const result = await adapter.toOAC(source);

      expect(result.frontmatter.name).toBe("MinimalAgent");
      expect(result.frontmatter.description).toBe("Agent imported from Codex CLI");
      expect(result.systemPrompt).toBe("");
    });

    it("ignores comments and blank lines", async () => {
      const source = `# This is a comment\n\nname = "CommentedAgent"\n\n# Another comment\ndescription = """\nDesc\n"""\n\ndeveloper_instructions = """\nPrompt\n"""`;

      const result = await adapter.toOAC(source);

      expect(result.frontmatter.name).toBe("CommentedAgent");
      expect(result.systemPrompt).toBe("Prompt");
    });
  });

  // ============================================================================
  // fromOAC() - GENERATING CODEX TOML
  // ============================================================================

  describe("fromOAC() - generating Codex TOML", () => {
    it("generates minimal TOML from OpenAgent", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "TestAgent",
          description: "Test description",
          mode: "primary",
        },
        metadata: { name: "TestAgent", category: "core", type: "agent" },
        systemPrompt: "You are helpful",
        contexts: [],
      };

      const result = await adapter.fromOAC(agent);

      expect(result.success).toBe(true);
      expect(result.configs).toHaveLength(1);
      expect(result.configs[0].fileName).toBe(".codex/agents/openagents-control/openagent.toml");
      expect(result.configs[0].content).toContain('name = "TestAgent"');
      expect(result.configs[0].content).toContain("Test description");
      expect(result.configs[0].content).toContain("You are helpful");
      expect(result.configs[0].content).toContain("nickname_candidates");
    });

    it("warns about unsupported temperature", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "TestAgent",
          description: "Test",
          mode: "primary",
          temperature: 0.5,
        },
        metadata: { name: "TestAgent", category: "core", type: "agent" },
        systemPrompt: "Prompt",
        contexts: [],
      };

      const result = await adapter.fromOAC(agent);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes("temperature"))).toBe(true);
    });

    it("warns about unsupported maxSteps", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "TestAgent",
          description: "Test",
          mode: "primary",
          maxSteps: 10,
        },
        metadata: { name: "TestAgent", category: "core", type: "agent" },
        systemPrompt: "Prompt",
        contexts: [],
      };

      const result = await adapter.fromOAC(agent);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes("maxSteps"))).toBe(true);
    });

    it("warns about unsupported permissions", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "TestAgent",
          description: "Test",
          mode: "primary",
          permission: { bash: "allow" },
        },
        metadata: { name: "TestAgent", category: "core", type: "agent" },
        systemPrompt: "Prompt",
        contexts: [],
      };

      const result = await adapter.fromOAC(agent);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes("permissions"))).toBe(true);
    });

    it("warns about unsupported hooks", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "TestAgent",
          description: "Test",
          mode: "primary",
          hooks: [{ event: "PreToolUse" as const, commands: [{ type: "command" as const, command: "echo test" }] }],
        },
        metadata: { name: "TestAgent", category: "core", type: "agent" },
        systemPrompt: "Prompt",
        contexts: [],
      };

      const result = await adapter.fromOAC(agent);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes("hooks"))).toBe(true);
    });

    it("warns about unsupported skills", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "TestAgent",
          description: "Test",
          mode: "primary",
          skills: ["test-skill"],
        },
        metadata: { name: "TestAgent", category: "core", type: "agent" },
        systemPrompt: "Prompt",
        contexts: [],
      };

      const result = await adapter.fromOAC(agent);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes("skills"))).toBe(true);
    });
  });

  // ============================================================================
  // VALIDATION
  // ============================================================================

  describe("validateConversion()", () => {
    it("warns when name is missing", () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "",
          description: "Test",
          mode: "primary",
        },
        metadata: { name: "", category: "core", type: "agent" },
        systemPrompt: "Prompt",
        contexts: [],
      };

      const warnings = adapter.validateConversion(agent);

      expect(warnings.some((w) => w.includes("name"))).toBe(true);
    });

    it("warns when description is missing", () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "TestAgent",
          description: "",
          mode: "primary",
        },
        metadata: { name: "TestAgent", category: "core", type: "agent" },
        systemPrompt: "Prompt",
        contexts: [],
      };

      const warnings = adapter.validateConversion(agent);

      expect(warnings.some((w) => w.includes("description"))).toBe(true);
    });
  });

  // ============================================================================
  // ROUND-TRIP
  // ============================================================================

  describe("round-trip", () => {
    it("preserves name, description, and systemPrompt through toOAC -> fromOAC", async () => {
      const original: OpenAgent = {
        frontmatter: {
          name: "RoundTripAgent",
          description: "A round-trip test agent",
          mode: "primary",
        },
        metadata: { name: "RoundTripAgent", category: "core", type: "agent" },
        systemPrompt: "You are a round-trip agent.",
        contexts: [],
      };

      const fromResult = await adapter.fromOAC(original);
      const toml = fromResult.configs[0].content;
      const parsed = await adapter.toOAC(toml);

      expect(parsed.frontmatter.name).toBe(original.frontmatter.name);
      expect(parsed.frontmatter.description).toBe(original.frontmatter.description);
      expect(parsed.systemPrompt).toBe(original.systemPrompt);
    });
  });
});
