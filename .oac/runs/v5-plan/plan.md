# OAC Quest v5 Implementation Plan

## Objective
Upgrade the OAC Quest system from v4 (simulate/handoff) to v5 with real runtime execution, verified completion gates, auto-fix retry loops, background/attachable runs, and mid-run intervention.

## Current State
- `oac experts --run` defaults to `simulate` (no-op scheduling)
- `--run --live` writes `handoff.json` but does not spawn agents
- `quest-complete` allows `--force` to skip verification
- `quest-verify` runs test/build/lint but does not gate completion
- `events.ndjson` + `quest-reconciler` already exist and work
- Budget tracking (`maxParallelAgents`, `maxApiCallsPerSession`) already enforced in `swarm-executor`
- `opencode-spawn.ts` already implements headless `opencode run` bridge

## Proposed Changes

### 1. Runtime Execution Bridges (NEW)
Create unified runtime bridge interface and three implementations:

- `packages/cli/src/lib/runtime-bridge.ts` — `RuntimeBridge` interface + `spawnRuntimeTask()`
- `packages/cli/src/lib/opencode-bridge.ts` — wraps existing `opencode-spawn.ts` with quest context injection
- `packages/cli/src/lib/kimi-bridge.ts` — spawns `kimi --work-dir . --agent-file … --print --prompt …`
- `packages/cli/src/lib/claude-bridge.ts` — spawns `claude --plugin-dir … --print …`

Each bridge:
- Receives `questId`, `objective`, `projectRoot`, `runDir`, `specPath`, `planPath`
- Constructs a runtime-specific prompt that loads quest artifacts and follows the v5 write-back contract
- Returns `{ ok, exitCode, stdout, stderr, durationMs }`
- Appends a `task_update` event to `events.ndjson` on completion/failure

### 2. `oac experts --run` Real Execution (MODIFY)
Update `packages/cli/src/commands/experts.ts`:

- Add `--runtime <opencode|kimi|claude>` option (required when execution is real)
- Add `--background` option to detach the runtime process
- Change `ExecutionMode` from `'simulate' | 'handoff'` to `'simulate' | 'handoff' | 'runtime'`
- In `runPipelineMode`, when `executionMode === 'runtime'`:
  1. Persist quest artifacts (quest.json, spec.json, plan.json, events.ndjson)
  2. For each batch, spawn the selected runtime bridge for each task
  3. Wait for runtime completion
  4. Reconcile events from `events.ndjson` to determine completed/failed tasks
  5. Run quality gate on changed files
  6. Update trust label based on actual results

Update `packages/cli/src/lib/swarm-executor.ts`:
- Add `'runtime'` to `ExecutionMode`
- In `executeSwarm()`, for `runtime` mode, delegate to `runtime-bridge.ts` instead of `simulateTaskExecution()`
- Ensure `trackApiCall` and `enforceParallelLimit` are still enforced per batch/task
- After execution, read back `events.ndjson` to determine actual task statuses

### 3. Mandatory Quality Gates (MODIFY)
Update `packages/cli/src/commands/quest-complete.ts`:

- Rename `--force` to `--skip-gates` with stronger warning
- Require `verification.overallPassed === true` by default
- Required checks: `test`, `build`, `lint` (auto-detected)
- Optional: `oac quality` if available
- If gates fail, block completion and suggest `oac quest-verify` or `--skip-gates`
- Append a `validation` event when completion is attempted

Update `packages/cli/src/commands/quest-verify.ts`:
- Ensure it detects and runs test/build/lint (already does)
- After running checks, if any failed, automatically trigger the auto-fix loop (see #4)

### 4. Auto-Fix Loop (NEW)
Create `packages/cli/src/lib/auto-fix-loop.ts`:

- `runAutoFixLoop(questId, projectRoot, options)`
- If `quest-verify` fails:
  1. Identify the owning expert for the failed task(s) from `quest.json`
  2. Spawn the same runtime with a fix prompt (e.g., "Fix failing test X")
  3. Retry verification
  4. Repeat up to `maxRetries` (default 3)
  5. After 3 failures, append an `error` event marking the task `blocked` and prompt the user

Integrate into `quest-verify.ts`:
- Add `--auto-fix` flag (default true for v5)
- Add `--max-retries <n>` option (default 3)

### 5. Background / Attachable Runs (MODIFY/NEW)
Update `packages/cli/src/commands/experts.ts`:
- `--background` flag: spawn runtime with `detached: true`, write PID to `.oac/runs/{questId}/run.pid`
- Print attach command: `oac experts --attach <questId>`

Update `packages/cli/src/commands/quest-status.ts`:
- Show background status: "running (pid 12345)" or "completed"
- Read `run.pid` and check if process is alive

New command: `oac quest-attach <quest-id>` (or `--attach` on experts)
- Reads `run.pid` and resumes monitoring the runtime process
- If process has exited, reconciles events and shows final state

Update `packages/cli/src/lib/quest-run.ts`:
- Add `run.pid` helper functions: `writeRunPid`, `readRunPid`, `isRunPidAlive`

### 6. Better Intervention / Mid-Run Amendments (MODIFY)
Update `packages/cli/src/commands/quest-amend.ts`:
- If the quest is currently running in background, send a signal (or append an `amendment` event and let the runtime poll)
- Since runtimes are external processes, the safest approach is append-only:
  1. `quest-amend` appends an `amendment` event to `events.ndjson`
  2. The runtime agent spec instructs the runtime to check `events.ndjson` for amendments before each turn
  3. New requirements become append-only events; DAG updates via `task_update` events
- Ensure `quest-amend` can add multiple tasks and update dependencies without losing existing state

### 7. Task-Level Event Tracking (ENSURE)
The infrastructure already exists. Ensure the new runtime bridges write:
- `task_update` on task start/complete/fail
- `file_change` on file modifications
- `validation` on verification results
- `error` on failures
- `state_change` on state transitions

Update `packages/cli/src/lib/runtime-bridge.ts` to append these events after runtime exit.

### 8. v5 Install / Update Polish (MODIFY)
Update `package.json`:
- Remove `test:quest-v2:*` and `test:quest-v3:*` scripts (naming drift)
- Add `test:quest-v4:kimi`, `test:quest-v4:opencode`
- Add `test:quest-v5:kimi`, `test:quest-v5:opencode`
- Update `test:quest-v4` and `test:quest-v5` aggregates

Update `scripts/tests/`:
- Copy `test-kimi-quest-cycle.sh` → `test-kimi-quest-v5.sh` with v5-specific checks (real execution, events.ndjson, verification gates)
- Copy `test-opencode-quest-cycle.sh` → `test-opencode-quest-v5.sh` with v5 checks
- Update existing scripts to be clearly labeled v4 or legacy

Update `install.sh` and `update.sh`:
- Print the v5 workflow clearly during install
- Mention `oac experts --run --runtime <name>` and `oac quest-status`

Update `packages/cli/src/lib/quest-run.ts`:
- Bump `QUEST_RUN_VERSION` from `'4'` to `'5'`
- Update `formatRuntimeHandoff` to reference v5 contract

### 9. Quest v5 Version Bump (MODIFY)
Update `packages/cli/src/lib/quest-run.ts`:
- `QUEST_RUN_VERSION = '5'`
- Update docs strings referencing v4 → v5

Update `packages/cli/src/commands/quest-status.ts`:
- Display `Quest v5:` instead of `Quest v4:`

## Affected Files

### New files
- `packages/cli/src/lib/runtime-bridge.ts`
- `packages/cli/src/lib/opencode-bridge.ts`
- `packages/cli/src/lib/kimi-bridge.ts`
- `packages/cli/src/lib/claude-bridge.ts`
- `packages/cli/src/lib/auto-fix-loop.ts`
- `packages/cli/src/commands/quest-attach.ts` (or integrate into experts.ts)
- `scripts/tests/test-kimi-quest-v5.sh`
- `scripts/tests/test-opencode-quest-v5.sh`

### Modified files
- `packages/cli/src/commands/experts.ts`
- `packages/cli/src/commands/quest-complete.ts`
- `packages/cli/src/commands/quest-verify.ts`
- `packages/cli/src/commands/quest-amend.ts`
- `packages/cli/src/commands/quest-status.ts`
- `packages/cli/src/lib/swarm-executor.ts`
- `packages/cli/src/lib/expert-pipeline.ts`
- `packages/cli/src/lib/quest-run.ts`
- `packages/cli/src/lib/quest-reconciler.ts`
- `packages/cli/src/lib/run-handoff.ts`
- `packages/cli/src/index.ts`
- `package.json`
- `install.sh`
- `update.sh`

## Acceptance Criteria
- [ ] `oac experts --run --runtime opencode "objective"` spawns `opencode run` and waits for real execution
- [ ] Same for `--runtime kimi` and `--runtime claude`
- [ ] `events.ndjson` receives `task_update`, `file_change`, `validation`, `error`, `state_change` events
- [ ] `quest-complete` blocks without passing test/build/lint gates (unless `--skip-gates`)
- [ ] Failed validations retry up to 3 times via auto-fix loop, then mark blocked
- [ ] Background runs start with `--background`, can be inspected via `oac quest-status`
- [ ] Mid-run amendments append events without losing quest state
- [ ] v5 test scripts exist and old v2/v3 naming is removed
- [ ] `quest.json` version is `5`

## Risks
- **Breaking change**: `--run` behavior changes from simulate to requiring `--runtime`. Need to handle backward compatibility or make it explicit.
- **Runtime availability**: `opencode`, `kimi`, `claude` must be on PATH. Bridges must gracefully degrade.
- **Process management**: Background detached processes may become zombies if not managed. Need PID tracking and cleanup.
- **Event concurrency**: Multiple runtimes appending to `events.ndjson` could race. Existing PID-based lock should handle this.
