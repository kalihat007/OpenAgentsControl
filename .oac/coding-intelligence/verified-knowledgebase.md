# Verified Knowledgebase

- **Objective:** Quest v13 semantic repo brain smoke
- **Generated:** 2026-06-01T06:20:10.161Z
- **Hallucination gate:** pass
- **Evidence confidence:** 0.85
- **Sources:** 85
- **Stale items:** 3

## Evidence Ledger

- **verified:** User objective is: Quest v13 semantic repo brain smoke
- **verified:** Project root is /Users/vikashchaudhary/Desktop/code/OpenAgentsControl
- **verified:** Repo wiki has 1656 files and 9 packages.
- **verified:** 62 affected file(s) are in scope.
- **verified:** 8 validation command(s) were selected from local context.
- **verified:** 9 package manifest(s) supply local script evidence.
- **verified:** Runtime compatibility matrix is covered for required runtimes.
- **assumed:** Security/secrets gate verdict is review.

## Hallucination Gate

- **pass:** Referenced patch files are present in scope, index, or repo wiki
- **pass:** Validation commands are grounded in known local scripts or shell checks
- **pass:** Quest v12 sidecars are declared for runtime handoff
- **pass:** Security/secrets gate is not blocked
- **pass:** Evidence ledger has no stale or unknown core facts

## Refresh Commands

- `oac repo-wiki`
- `oac quest-v9`
- `npm run test:quest-v8:kimi`
- `npm run test:quest-v8:opencode`
- `npm run test:quest-v8:codex`
