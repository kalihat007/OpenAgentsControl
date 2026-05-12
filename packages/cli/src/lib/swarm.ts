/**
 * Swarm orchestration integration for the OAC CLI.
 *
 * When expert mode is enabled (the default), this module surfaces the
 * swarm-runtime primitives so that CLI commands and agent contexts can
 * plan batches, manage sessions, and resolve team roles.
 */

import type {
  SwarmTask,
  SwarmBatch,
  SwarmSession,
  SwarmRole,
  SchedulerOptions,
  SchedulerResult,
} from "@nextsystems/oac-swarm-runtime";

import {
  planSwarmBatches,
  createSwarmSession,
  appendSwarmEvent,
  DEVELOPMENT_SWARM_TEAM,
  agentForRole,
} from "@nextsystems/oac-swarm-runtime";

import {
  type OacConfig,
  isAgentSwarmEnabled,
  getMaxParallelAgents,
  getMaxApiCallsPerSession,
} from "./config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { SwarmTask, SwarmBatch, SwarmSession, SwarmRole, SchedulerOptions, SchedulerResult };

export type ExpertSwarmContext = {
  /** Whether the swarm runtime is active for this session */
  active: boolean;
  /** Pre-configured development swarm team */
  team: typeof DEVELOPMENT_SWARM_TEAM;
  /** Current swarm session (null when inactive) */
  session: SwarmSession | null;
  /** Max parallel agents to avoid API overload */
  maxParallelAgents: number;
  /** Max API calls allowed in this session */
  maxApiCallsPerSession: number;
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns an `ExpertSwarmContext` gated by the user's config.
 * If expert mode or agent swarm is disabled, the context is inactive.
 */
export function getExpertSwarmContext(
  config: OacConfig,
  sessionId: string,
  objective: string,
): ExpertSwarmContext {
  const active = isAgentSwarmEnabled(config);
  return {
    active,
    team: DEVELOPMENT_SWARM_TEAM,
    session: active
      ? createSwarmSession({
          id: sessionId,
          objective,
          tasks: [],
        })
      : null,
    maxParallelAgents: getMaxParallelAgents(config),
    maxApiCallsPerSession: getMaxApiCallsPerSession(config),
  };
}

/**
 * Plans dependency-aware batches for a set of swarm tasks.
 * Respects maxParallelAgents from config to avoid API overload.
 * Returns an empty result when the swarm is inactive.
 */
export function planExpertBatches(
  config: OacConfig,
  tasks: SwarmTask[],
  options?: SchedulerOptions,
): SchedulerResult {
  if (!isAgentSwarmEnabled(config)) {
    return { batches: [], blocked: [], events: [] };
  }
  const maxConcurrency = Math.min(
    options?.maxConcurrency ?? getMaxParallelAgents(config),
    getMaxParallelAgents(config),
  );
  return planSwarmBatches(tasks, { ...options, maxConcurrency });
}

/**
 * Looks up the agent name for a given swarm role.
 * Falls back to the role id when the swarm is inactive.
 */
export function resolveExpertAgent(config: OacConfig, role: SwarmRole): string {
  if (!isAgentSwarmEnabled(config)) {
    return role;
  }
  return agentForRole(role) ?? role;
}

/**
 * Appends an event to a swarm session.
 * No-op when the session is null (swarm inactive).
 */
export function recordExpertEvent(
  session: SwarmSession | null,
  type: Parameters<typeof appendSwarmEvent>[1],
  message: Parameters<typeof appendSwarmEvent>[2],
  data?: Parameters<typeof appendSwarmEvent>[3],
): SwarmSession | null {
  if (session === null) return null;
  return appendSwarmEvent(session, type, message, data);
}

/**
 * Returns a short human-readable status string for the swarm.
 */
export function getSwarmStatus(config: OacConfig): string {
  if (!isAgentSwarmEnabled(config)) {
    return "Agent swarm: disabled (enable expertMode + useAgentSwarm in .oac/config.json)";
  }
  const maxParallel = getMaxParallelAgents(config);
  const maxCalls = getMaxApiCallsPerSession(config);
  return `Agent swarm: active — maxParallelAgents=${maxParallel}, maxApiCallsPerSession=${maxCalls}`;
}
