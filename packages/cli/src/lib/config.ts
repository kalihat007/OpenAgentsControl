import { z } from "zod";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export const OacV6PreferencesSchema = z.object({
  enabled: z.boolean().default(false),
  distributedSwarm: z.object({
    enabled: z.boolean().default(false),
    defaultRuntime: z.enum(["opencode", "kimi", "claude", "codex", "local"]).default("kimi"),
    allowMultiRuntime: z.boolean().default(true),
    maxConcurrentRuntimes: z.number().int().min(1).max(10).default(3),
  }).default({}),
  teamMemory: z.object({
    enabled: z.boolean().default(true),
    maxLessons: z.number().int().min(10).max(2000).default(500),
    autoLearnFromSuccess: z.boolean().default(true),
    autoLearnFromFailure: z.boolean().default(true),
  }).default({}),
  worktrees: z.object({
    enabled: z.boolean().default(false),
    mergeStrategy: z.enum(["manual", "auto-squash", "auto-rebase"]).default("manual"),
  }).default({}),
  incidents: z.object({
    enabled: z.boolean().default(true),
    autoCreateOnFailure: z.boolean().default(true),
    requirePostMortem: z.boolean().default(false),
  }).default({}),
});

export const OacV8PreferencesSchema = z.object({
  enabled: z.boolean().default(true),
  reviewGate: z.object({
    enabled: z.boolean().default(true),
    autoApproveOnNoChanges: z.boolean().default(true),
    requiredFor: z.array(z.enum(["lite", "standard", "deep"])).default(["standard", "deep"]),
    excludedFor: z.array(z.enum(["lite", "standard", "deep"])).default(["lite"]),
  }).default({}),
  priorityQueue: z.object({
    enabled: z.boolean().default(true),
    maxConcurrentUrgent: z.number().int().min(1).max(5).default(2),
    preemptOnCritical: z.boolean().default(false),
  }).default({}),
  selfImprovement: z.object({
    enabled: z.boolean().default(true),
    patternCorpusMaxSize: z.number().int().min(10).max(5000).default(1000),
    minPatternConfidence: z.number().min(0).max(1).default(0.7),
    boostSuccessPatterns: z.boolean().default(true),
    penalizeFailedPatterns: z.boolean().default(true),
  }).default({}),
});

export const OacPreferencesSchema = z.object({
  yoloMode: z.boolean(),
  autoBackup: z.boolean(),
  expertMode: z.boolean(),
  useAgentSwarm: z.boolean(),
  maxParallelAgents: z.number().int().min(1).max(20),
  maxApiCallsPerSession: z.number().int().min(10).max(10000),
});

export const OacConfigSchema = z.object({
  version: z.literal("1"),
  preferences: OacPreferencesSchema,
  v6: OacV6PreferencesSchema.optional(),
  v8: OacV8PreferencesSchema.optional(),
});

export type OacPreferences = z.infer<typeof OacPreferencesSchema>;
export type OacV6Preferences = z.infer<typeof OacV6PreferencesSchema>;
export type OacV8Preferences = z.infer<typeof OacV8PreferencesSchema>;
export type OacConfig = z.infer<typeof OacConfigSchema>;

export const DEFAULT_MAX_PARALLEL_AGENTS = 2;

export const getConfigPath = (projectRoot: string): string =>
  join(projectRoot, ".oac", "config.json");

export const createDefaultConfig = (): OacConfig => ({
  version: "1",
  preferences: {
    yoloMode: false,
    autoBackup: true,
    expertMode: true,
    useAgentSwarm: true,
    maxParallelAgents: DEFAULT_MAX_PARALLEL_AGENTS,
    maxApiCallsPerSession: 500,
  },
  v6: OacV6PreferencesSchema.parse({}),
  v8: OacV8PreferencesSchema.parse({}),
});

// Pure — returns new object, no mutation
export const mergeConfig = (base: OacConfig, overrides: Partial<OacPreferences>): OacConfig =>
  ({ ...base, preferences: { ...base.preferences, ...overrides } });

export const isYoloMode = (config: OacConfig): boolean =>
  config.preferences.yoloMode || process.env["CI"] === "true";

export const isAutoBackup = (config: OacConfig): boolean =>
  config.preferences.autoBackup;

export const isExpertMode = (config: OacConfig): boolean =>
  config.preferences.expertMode;

export const isAgentSwarmEnabled = (config: OacConfig): boolean =>
  config.preferences.expertMode && config.preferences.useAgentSwarm;

export const getMaxParallelAgents = (config: OacConfig): number =>
  config.preferences.maxParallelAgents;

export const getMaxApiCallsPerSession = (config: OacConfig): number =>
  config.preferences.maxApiCallsPerSession;

export const isV6Enabled = (config: OacConfig): boolean =>
  config.v6?.enabled ?? false;

export const getV6Preferences = (config: OacConfig): OacV6Preferences | undefined =>
  config.v6;

export const isV8Enabled = (config: OacConfig): boolean =>
  config.v8?.enabled ?? false;

export const getV8Preferences = (config: OacConfig): OacV8Preferences | undefined =>
  config.v8;

export async function readConfig(projectRoot: string): Promise<OacConfig | null> {
  const configPath = getConfigPath(projectRoot);
  if (!(await Bun.file(configPath).exists())) return null;
  const raw = await Bun.file(configPath).json() as unknown;
  const result = OacConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid config at "${configPath}": ${result.error.message}`);
  }
  return result.data;
}

export async function writeConfig(projectRoot: string, config: OacConfig): Promise<void> {
  const configPath = getConfigPath(projectRoot);
  await mkdir(dirname(configPath), { recursive: true });
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}
