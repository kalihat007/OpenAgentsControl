# OAC Swarm Runtime

Typed primitives for safe, controlled agent swarm execution.

The runtime does not call models directly. It gives OAC agents and CLIs a shared model for:

- dependency-aware task batching
- file write-lock conflict detection
- bounded parallelism
- session and event records
- integration gates before completion

Use it as the scheduler backbone behind OpenAgent Swarm Mode, `SwarmOrchestrator`, `BatchExecutor`, and future dashboard or CLI surfaces.
