# feat: Quest v12 verified knowledgebase smoke

## Summary

- Updated 24 file(s).
- Selected 7 minimum validation command(s).
- Automatic review verdict: needs-review.
- Contract drift watchers: 13
- Test gaps: 3
- Security gate: review

## Validation

- bash -n plugins/codex-cli/configure-codex-quest-default.sh scripts/tests/test-codex-quest-v8.sh scripts/tests/test-kimi-quest-v8.sh scripts/tests/test-opencode-quest-v8.sh: security gate
- bun test packages/cli/src/lib/quest-coding-intelligence.test.ts packages/cli/src/lib/quest-run.test.ts packages/cli/src/lib/runtime-bridge.test.ts: pending
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

## Reviewer Focus

-  M packages/cli/.opencode/.expert-memory.json
- .opencode/agent/core/openagent.md
- .opencode/context/core/quest-mode.md
- README.md
- packages/cli/src/commands/quest-v9.ts
- packages/cli/src/lib/quest-coding-execution.ts
- packages/cli/src/lib/quest-coding-intelligence.test.ts
- packages/cli/src/lib/quest-coding-intelligence.ts
- packages/cli/src/lib/quest-run.test.ts
- packages/cli/src/lib/quest-run.ts
- packages/cli/src/lib/quest-verified-knowledgebase.ts
- packages/cli/src/lib/runtime-bridge.test.ts

## Blockers

- No blockers detected.
