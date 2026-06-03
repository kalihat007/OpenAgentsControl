# Quest v19 Deep Coding Collaboration OS

Quest v19 makes OpenAgent think deeper before coding and collaborate from idea
to build. It turns the current Quest evidence into hard questions, build slices,
smarter code moves, tradeoffs, and next-step recommendations.

## Purpose

Quest v19 is designed for coding requests that start as an idea:

- frame the product/developer outcome before editing
- ask hard questions when the request can change scope or architecture
- choose a smaller, smarter implementation slice when the risk is high
- expose tradeoffs instead of hiding them in code
- keep user decisions, agent commitments, and expert responsibilities visible
- suggest build-better next steps after completion, then wait for the user

## Artifacts

Quest v19 writes these files in `.oac/runs/{quest-id}/` and
`.oac/coding-intelligence/`:

```text
deep-coding-collaboration-os.json
deep-thinking-review.json
idea-to-build-brief.json
smarter-code-plan.json
collaboration-board.json
decision-tradeoff-matrix.json
build-better-roadmap.md
```

## Runtime Behavior

OpenAgent, Kimi, OpenCode, Codex, and Claude should use v19 before editing and
before completion. The runtime should load only the v19 sidecars relevant to the
touched files, symbols, validation, deep-thinking review, or user decision. It
must not read every optional sidecar in a loop.

When `deep-coding-collaboration-os.json` is blocked or review-gated, the runtime
should either choose a smaller verified build slice or ask the user for the
product/architecture decision.

## CLI

`quest-v9` refreshes the v9-v21 intelligence sidecars. `quest-replay` still
prints replayable proof, while v19 adds build-better collaboration guidance.

```bash
oac quest-v9 <quest-id>
oac quest-replay <quest-id>
```
