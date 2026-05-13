export type SwarmTaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type SwarmEventType =
  | "session.created"
  | "module.claimed"
  | "contract.created"
  | "task.chunked"
  | "task.ready"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "batch.planned"
  | "sync.required"
  | "sync.completed"
  | "lock.conflict"
  | "incident.created"
  | "checkpoint.created"
  | "gate.required"
  | "gate.passed";

export type SwarmExecutionMode = "serial" | "parallel";

export type SwarmRole =
  | "product-manager"
  | "system-architect"
  | "tech-lead"
  | "frontend-developer"
  | "backend-developer"
  | "devops"
  | "qa"
  | "security"
  | "code-review"
  | "documentation"
  | "merge-coordinator"
  | "integration"
  | "debug"
  | "chief-growth-officer"
  | "market-intelligence"
  | "customer-research"
  | "brand-strategy"
  | "lead-generation"
  | "conversion"
  | "pricing-strategy"
  | "content-swarm"
  | "social-media"
  | "pr-communications"
  | "customer-success"
  | "trust-reputation"
  | "performance-analytics"
  | "predictive-revenue"
  | "sales-coach"
  | "ceo"
  | "customer-support-success"
  | "product-strategy"
  | "regulatory-compliance"
  | "talent-hiring"
  | "finance-investor-relations"
  | "supply-chain-manufacturing"
  | "innovation-rd"
  | "crisis-response"
  | "partnership-ecosystem"
  | "knowledge-management"
  | "hardware-architect"
  | "fpga-asic"
  | "rtos-os"
  | "embedded-cpp"
  | "automotive-ethernet"
  | "security-firmware"
  | "technical-python-tooling"
  | "embedded-rust"
  | "hil-sil"
  | "penetration-test"
  | "technical-compliance-vv"
  | "emc-environmental"
  | "technical-cicd"
  | "technical-release"
  | "investor-narrative"
  | "funding-round-simulation"
  | "investor-pr-media"
  | "linkedin-thought-leadership"
  | "event-conference"
  | "analyst-relations"
  | "social-proof-validation"
  | "crisis-opportunity"
  | "investor-metrics"
  | "general";

export interface SwarmTask {
  id: string;
  title: string;
  agent: string;
  role?: SwarmRole;
  status?: SwarmTaskStatus;
  stage?: string;
  executionMode?: SwarmExecutionMode;
  parentTaskId?: string;
  chunkIndex?: number;
  chunkTotal?: number;
  maxChunkMinutes?: number;
  syncAfterTaskIds?: string[];
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  moduleClaims?: string[];
  contracts?: string[];
  priority?: number;
  acceptanceCriteria?: string[];
  metadata?: Record<string, unknown>;
}

export interface SwarmBatch {
  id: string;
  tasks: SwarmTask[];
  writeLocks: string[];
  blockedTaskIds: string[];
}

export interface SwarmSession {
  id: string;
  objective: string;
  createdAt: string;
  maxConcurrency: number;
  tasks: SwarmTask[];
  moduleClaims: ModuleClaim[];
  contracts: SwarmContract[];
  incidents: SwarmIncident[];
  checkpoints: SwarmCheckpoint[];
  events: SwarmEvent[];
}

export interface SwarmEvent {
  type: SwarmEventType;
  timestamp: string;
  taskId?: string;
  batchId?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface SchedulerOptions {
  maxConcurrency?: number;
  allowReadWriteOverlap?: boolean;
}

export interface SchedulerResult {
  batches: SwarmBatch[];
  blocked: SwarmTask[];
  events: SwarmEvent[];
}

export interface LockConflict {
  taskId: string;
  conflictingTaskId: string;
  path: string;
  reason: "write-write" | "read-write" | "module-claim";
}

export interface ModuleClaim {
  module: string;
  ownerTaskId: string;
  ownerAgent: string;
  paths: string[];
  status: "claimed" | "released";
}

export interface SwarmContract {
  id: string;
  ownerTaskId: string;
  type: "api" | "event" | "schema" | "interface" | "infrastructure";
  path?: string;
  description: string;
  consumers: string[];
}

export interface SwarmIncident {
  id: string;
  taskId?: string;
  command?: string;
  summary: string;
  evidence: string[];
  status: "open" | "investigating" | "resolved";
  createdAt: string;
}

export interface SwarmCheckpoint {
  id: string;
  taskId: string;
  artifactPaths: string[];
  validation: string[];
  createdAt: string;
}
