# feat: Quest Coding Execution v11 smoke

## Summary

- Updated 55 file(s).
- Selected 8 minimum validation command(s).
- Automatic review verdict: needs-review.
- Contract drift watchers: 20
- Test gaps: 7
- Security gate: review

## Validation

- bash -n plugins/codex-cli/configure-codex-quest-default.sh scripts/tests/test-codex-quest-v8.sh scripts/tests/test-kimi-quest-cycle.sh scripts/tests/test-kimi-quest-v5.sh scripts/tests/test-kimi-quest-v6.sh scripts/tests/test-kimi-quest-v7.sh scripts/tests/test-kimi-quest-v8.sh scripts/tests/test-opencode-quest-v8.sh: security gate
- bun test dev/dashboard-project/period/tests/period.test.js dev/dashboard-project/star-sign/tests/star-sign.test.js dev/dashboard-project/time/tests/time.test.js dev/dashboard-project/ui/tests/ui.test.js evals/framework/scripts/test/test-agent-direct.ts evals/framework/scripts/test/test-event-inspector.js evals/framework/scripts/test/test-timeline.ts evals/framework/scripts/test/verify-timeline.ts: pending
- git diff --check: pending
- git diff --check: security gate
- npm run build -w packages/cli: pending
- npm run test:quest-v8:codex: pending
- npm run test:quest-v8:codex: required when runtime surface changes
- npm run test:quest-v8:kimi: pending
- npm run test:quest-v8:kimi: required when runtime surface changes
- npm run test:quest-v8:opencode: pending
- npm run test:quest-v8:opencode: required when runtime surface changes
- npm run typecheck -w packages/cli: pending
- npm run typecheck -w packages/swarm-runtime: pending

## Reviewer Focus

-  M packages/cli/.opencode/.expert-memory.json
- .oac/coding-intelligence/
- .oac/repo-wiki/
- .opencode/agent/core/openagent.md
- .opencode/context/core/quest-mode.md
- README.md
- package.json
- packages/cli/.opencode/.expert-memory.json
- packages/cli/src/commands/memory-promote.ts
- packages/cli/src/commands/quest-complete.test.ts
- packages/cli/src/commands/quest-complete.ts
- packages/cli/src/commands/quest-status.test.ts

## Blockers

- No blockers detected.
