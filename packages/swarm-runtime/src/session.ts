import type { SwarmEvent, SwarmEventType, SwarmSession, SwarmTask } from "./types.js";

export function createSwarmSession(input: {
  id: string;
  objective: string;
  tasks: SwarmTask[];
  maxConcurrency?: number;
  createdAt?: string;
}): SwarmSession {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const session: SwarmSession = {
    id: input.id,
    objective: input.objective,
    createdAt,
    maxConcurrency: input.maxConcurrency ?? 4,
    tasks: input.tasks,
    moduleClaims: [],
    contracts: [],
    incidents: [],
    checkpoints: [],
    events: [],
  };

  return appendSwarmEvent(session, "session.created", "Swarm session created");
}

export function appendSwarmEvent(
  session: SwarmSession,
  type: SwarmEventType,
  message: string,
  data: Record<string, unknown> = {},
): SwarmSession {
  const event: SwarmEvent = {
    type,
    timestamp: new Date().toISOString(),
    message,
    data,
  };

  return {
    ...session,
    events: [...session.events, event],
  };
}
