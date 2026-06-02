import { BaseAdapter } from "./BaseAdapter.js";
import type {
  OpenAgent,
  ConversionResult,
  ToolCapabilities,
  AgentFrontmatter,
} from "../types.js";

/**
 * Codex CLI adapter for converting between OpenAgents Control and Codex CLI formats.
 *
 * Codex CLI uses standalone TOML files under `~/.codex/agents/`:
 * - `name` — agent identifier
 * - `description` — multi-line description (triple-quoted)
 * - `nickname_candidates` — array of aliases for chat references
 * - `developer_instructions` — system prompt (triple-quoted)
 *
 * @see https://developers.openai.com/codex/subagents
 */
export class CodexAdapter extends BaseAdapter {
  readonly name = "codex";
  readonly displayName = "Codex CLI";

  constructor() {
    super();
  }

  // ============================================================================
  // CONVERSION METHODS
  // ============================================================================

  /**
   * Convert Codex TOML format TO OpenAgents Control format.
   *
   * Parses a minimal subset of TOML sufficient for Codex custom-agent files:
   * - `key = "value"` strings
   * - `key = ["a", "b"]` string arrays
   * - `key = """\nmulti-line\n"""` triple-quoted strings
   *
   * @param source - TOML file content
   * @returns OpenAgent object
   */
  toOAC(source: string): Promise<OpenAgent> {
    const parsed = this.parseMinimalTOML(source);

    const frontmatter: AgentFrontmatter = {
      name: String(parsed.name || "codex-agent"),
      description: String(parsed.description || "Agent imported from Codex CLI"),
      mode: "primary",
    };

    if (parsed.model) {
      frontmatter.model = String(parsed.model);
    }

    return Promise.resolve({
      frontmatter,
      metadata: {
        name: frontmatter.name,
        category: "core",
        type: "agent",
      },
      systemPrompt: String(parsed.developer_instructions || ""),
      contexts: [],
    });
  }

  /**
   * Convert FROM OpenAgents Control format to Codex CLI TOML format.
   *
   * Generates a single `.codex/agents/openagents-control/openagent.toml` file.
   *
   * @param agent - OpenAgent to convert
   * @returns ConversionResult with generated TOML file and warnings
   */
  fromOAC(agent: OpenAgent): Promise<ConversionResult> {
    const warnings: string[] = [];

    const validationWarnings = this.validateConversion(agent);
    warnings.push(...validationWarnings);

    // Feature-loss warnings
    if (agent.frontmatter.temperature !== undefined) {
      warnings.push(
        this.unsupportedFeatureWarning("temperature", agent.frontmatter.temperature)
      );
    }

    if (agent.frontmatter.maxSteps !== undefined) {
      warnings.push(
        this.unsupportedFeatureWarning("maxSteps", agent.frontmatter.maxSteps)
      );
    }

    if (agent.frontmatter.permission) {
      warnings.push(
        this.degradedFeatureWarning(
          "granular permissions",
          "allow/deny/ask per path",
          "not supported (Codex uses CLI-level permission profiles)"
        )
      );
    }

    if (agent.frontmatter.hooks && agent.frontmatter.hooks.length > 0) {
      warnings.push(
        this.unsupportedFeatureWarning("hooks", agent.frontmatter.hooks.length)
      );
    }

    if (agent.frontmatter.skills && agent.frontmatter.skills.length > 0) {
      warnings.push(
        this.unsupportedFeatureWarning("skills", agent.frontmatter.skills.length)
      );
    }

    const toml = this.generateCodexTOML(agent);

    return Promise.resolve(
      this.createSuccessResult(
        [
          {
            fileName: ".codex/agents/openagents-control/openagent.toml",
            content: toml,
            encoding: "utf-8",
          },
        ],
        warnings
      )
    );
  }

  /**
   * Get the configuration path for Codex CLI.
   */
  getConfigPath(): string {
    return ".codex/agents/openagents-control/";
  }

  /**
   * Get Codex CLI capabilities.
   */
  getCapabilities(): ToolCapabilities {
    return {
      name: this.name,
      displayName: this.displayName,
      supportsMultipleAgents: false,
      supportsSkills: false,
      supportsHooks: false,
      supportsGranularPermissions: false,
      supportsContexts: false,
      supportsCustomModels: false,
      supportsTemperature: false,
      supportsMaxSteps: false,
      configFormat: "plain",
      outputStructure: "single-file",
      notes: [
        "Codex CLI uses a single TOML file per custom agent under ~/.codex/agents/",
        "No skills, hooks, or granular permissions - only name, description, nickname_candidates, developer_instructions",
        "Model selection is handled by the Codex CLI (~/.codex/config.toml), not the agent file",
        "Triple-quoted TOML strings are used for multi-line description and developer_instructions",
      ],
    };
  }

  /**
   * Validate if an agent can be converted with full fidelity.
   */
  validateConversion(agent: OpenAgent): string[] {
    const warnings: string[] = [];

    if (!agent.frontmatter.name) {
      warnings.push("⚠️  Agent name is required for Codex CLI");
    }

    if (!agent.frontmatter.description) {
      warnings.push("⚠️  Agent description is recommended for Codex CLI");
    }

    return warnings;
  }

  // ============================================================================
  // TOML PARSING / GENERATION
  // ============================================================================

  /**
   * Parse a minimal subset of TOML suitable for Codex custom-agent files.
   */
  private parseMinimalTOML(source: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = source.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        i++;
        continue;
      }

      // Find key = value separator
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) {
        i++;
        continue;
      }

      const key = trimmed.slice(0, eqIndex).trim();
      let remainder = trimmed.slice(eqIndex + 1).trim();

      // Triple-quoted string
      if (remainder.startsWith('"""')) {
        let value = "";
        const firstLine = remainder.slice(3);
        if (firstLine.endsWith('"""')) {
          value = firstLine.slice(0, -3);
          i++;
        } else {
          value = firstLine;
          i++;
          while (i < lines.length) {
            const nextLine = lines[i] ?? "";
            if (nextLine.trimEnd().endsWith('"""')) {
              value += "\n" + nextLine.trimEnd().slice(0, -3);
              i++;
              break;
            } else {
              value += "\n" + nextLine;
              i++;
            }
          }
        }
        result[key] = value.trim();
        continue;
      }

      // Array
      if (remainder.startsWith("[")) {
        // Collect until closing bracket (may span lines)
        let arrayStr = remainder;
        while (i < lines.length && !arrayStr.includes("]")) {
          i++;
          if (i < lines.length) {
            arrayStr += (lines[i] ?? "").trim();
          }
        }
        const inner = arrayStr.slice(1, arrayStr.indexOf("]")).trim();
        const items = inner
          .split(",")
          .map((s) => s.trim().replace(/^"/, "").replace(/"$/, ""))
          .filter((s) => s.length > 0);
        result[key] = items;
        i++;
        continue;
      }

      // Simple string value
      if (remainder.startsWith('"') && remainder.endsWith('"')) {
        result[key] = remainder.slice(1, -1);
      } else {
        result[key] = remainder;
      }
      i++;
    }

    return result;
  }

  /**
   * Generate Codex custom-agent TOML from an OpenAgent.
   */
  private generateCodexTOML(agent: OpenAgent): string {
    const lines: string[] = [];

    lines.push(`name = "${this.escapeTOMLString(agent.frontmatter.name || "agent")}"`);

    const description = agent.frontmatter.description || "";
    lines.push(`description = """`);
    lines.push(description);
    lines.push(`"""`);

    // nickname_candidates — derive from name or use empty array
    const candidates = [agent.frontmatter.name || "agent"];
    lines.push(`nickname_candidates = [${candidates.map((c) => `"${this.escapeTOMLString(c)}"`).join(", ")}]`);
    lines.push("");

    const systemPrompt = agent.systemPrompt || "";
    lines.push(`developer_instructions = """`);
    lines.push(systemPrompt);
    lines.push(`"""`);

    return lines.join("\n") + "\n";
  }

  /**
   * Escape special characters for TOML inline strings.
   */
  private escapeTOMLString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
}
