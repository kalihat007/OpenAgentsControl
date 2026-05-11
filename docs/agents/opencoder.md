# OpenAgent - Legacy Compatibility Development Agent

**Use `opencode --agent OpenAgent` for development work.**

OpenAgent remains documented as a legacy compatibility component, but the user-facing workflow is now single-entrypoint: OpenAgent routes complex coding, architecture, refactoring, testing, review, and swarm work internally.

---

## Table of Contents

- [What is OpenAgent?](#what-is-openagent)
- [When to Use OpenAgent](#when-to-use-openagent)
- [When to Use OpenAgent Instead](#when-to-use-openagent-instead)
- [Core Capabilities](#core-capabilities)
- [Workflow](#workflow)
- [Multi-Language Support](#multi-language-support)
- [Code Standards](#code-standards)
- [Subagent Delegation](#subagent-delegation)
- [Examples](#examples)
- [Tips for Best Results](#tips-for-best-results)

---

## What is OpenAgent?

OpenAgent is a **specialized development agent** focused on complex coding tasks, architecture analysis, and multi-file refactoring. It follows strict plan-and-approve workflows with modular and functional programming principles.

**Key Characteristics:**
- 🎯 **Specialized** - Deep focus on code quality and architecture
- 🔧 **Multi-language** - Adapts to TypeScript, Python, Go, Rust, C#, and more
- 📐 **Plan-first** - Always proposes plans before implementation
- 🏗️ **Modular** - Emphasizes clean architecture and separation of concerns
- ✅ **Quality-focused** - Includes testing, type checking, and validation

---

## When OpenAgent Uses Development Routing

OpenAgent handles these development workflows and may route internally to coding specialists:

✅ **Multi-file refactoring** (4+ files)
- Refactoring an entire module
- Implementing patterns across multiple components
- Restructuring architecture

✅ **Architecture analysis and improvements**
- Analyzing codebase structure
- Identifying architectural issues
- Proposing design improvements

✅ **Complex code implementations**
- Features spanning multiple modules
- Implementations requiring > 60 minutes
- Features with complex dependencies

✅ **Pattern discovery and application**
- Finding existing patterns in codebase
- Implementing consistent patterns
- Refactoring to match established patterns

✅ **Deep codebase analysis**
- Understanding complex code flows
- Documenting architecture
- Identifying technical debt

---

## User-Facing Entry Point

Use **OpenAgent** for:
- ❓ Questions about code or concepts
- 📝 Documentation tasks
- 🔄 Simple and complex code changes
- 🎯 General workflow coordination
- 🧠 Architecture and refactoring
- 🧪 Testing, review, build, and validation
- 🧩 Swarm and system-builder workflows
- 💬 Exploratory conversations

**Rule of thumb:** 
- **OpenAgent** = General coordinator (questions, docs, coordination, simple tasks)
- **OpenAgent** = Development specialist (complex coding, architecture, refactoring)

---

## Core Capabilities

### Code Implementation
- Modular architecture design
- Functional programming patterns
- Type-safe implementations
- SOLID principles adherence
- Clean code practices
- Proper separation of concerns

### Analysis & Review
- Architecture analysis
- Pattern discovery
- Code quality assessment
- Technical debt identification
- Performance analysis

### Refactoring
- Multi-file refactoring
- Pattern implementation
- Architecture improvements
- Code modernization
- Technical debt reduction

### Quality Assurance
- Type checking (TypeScript, Python, Go, Rust, C#)
- Linting (ESLint, Pylint, etc.)
- Build validation
- Test execution
- Incremental validation

---

## Workflow

### Phase 1: Planning (Required)

OpenAgent **always** proposes a plan first:

```
1. Analyzes the request
2. Creates step-by-step implementation plan
3. Presents plan to user
4. Waits for approval
```

**No implementation happens without approval.**

For features spanning multiple modules or estimated > 60 minutes, OpenAgent delegates to `@task-manager` to create atomic subtasks.

---

### Phase 2: Implementation (After Approval)

Implements **incrementally** - one step at a time:

```
For each step:
1. Implement the code
2. Run type checks (if applicable)
3. Run linting (if configured)
4. Run build checks
5. Execute relevant tests
6. Validate results
7. Move to next step
```

**Validation happens continuously**, not just at the end.

For simple subtasks, delegates to `@subagents/coder-agent` to save time.

---

### Phase 3: Completion

When implementation is complete:

```
1. Final validation
2. User approval
3. Handoff recommendations for:
   - @tester (if tests needed)
   - @documentation (if docs needed)
   - @reviewer (if security review needed)
```

---

## Multi-Language Support

OpenAgent adapts to the project's language automatically:

### TypeScript/JavaScript
- Runtime: `node`, `bun`, or `deno`
- Type checking: `tsc`
- Linting: `eslint`
- Testing: `jest`, `vitest`, `mocha`

### Python
- Runtime: `python`
- Type checking: `mypy`
- Linting: `pylint`, `flake8`
- Testing: `pytest`, `unittest`

### Go
- Build: `go build`
- Linting: `golangci-lint`
- Testing: `go test`

### Rust
- Build: `cargo check`, `cargo build`
- Linting: `clippy`
- Testing: `cargo test`

### C# / .NET
- Runtime: `dotnet run`
- Type checking: built-in (Roslyn compiler)
- Linting: `dotnet format`, Roslyn analyzers
- Testing: `dotnet test` (xUnit + Shouldly + NSubstitute)

---

## Code Standards

OpenAgent follows these principles:

### Modular Architecture
- Clear module boundaries
- Single responsibility principle
- Loose coupling, high cohesion
- Dependency injection where appropriate

### Functional Patterns
- Pure functions where possible
- Immutable data structures
- Declarative over imperative
- Function composition

### Type Safety
- Strong typing (when language supports)
- Explicit types over inference (when clearer)
- Type guards and validation
- Null safety

### Clean Code
- Meaningful names
- Small, focused functions
- Minimal, high-signal comments
- Avoid over-complication
- Follow language conventions

---

## Subagent Delegation

OpenAgent coordinates with specialized subagents:

### @task-manager
**When:** Features spanning 4+ files or > 60 minutes
**Purpose:** Break down into atomic subtasks
**Output:** Task files under `tasks/subtasks/{feature}/`

### @coder-agent
**When:** Simple, focused implementation tasks
**Purpose:** Quick code implementation
**Output:** Implemented code following specifications

### @tester
**When:** Tests needed for implementation
**Purpose:** Write comprehensive test suites
**Output:** Unit, integration, and e2e tests

### @reviewer
**When:** Security or quality review needed
**Purpose:** Code review, security analysis
**Output:** Review report with recommendations

### @build-agent
**When:** Build validation needed
**Purpose:** Type checking, build verification
**Output:** Build status, error reports

### @documentation
**When:** Comprehensive documentation needed
**Purpose:** Generate API docs, guides
**Output:** Structured documentation

---

## Examples

### Example 1: Multi-File Refactoring

```bash
opencode --agent OpenAgent
> "Refactor the authentication module to use dependency injection across all 8 files"

# OpenAgent will:
# 1. Analyze current structure (8 files)
# 2. Propose refactoring plan
# 3. Wait for approval
# 4. Delegate to @task-manager (8 files > 4 file threshold)
# 5. Implement subtasks one at a time
# 6. Validate incrementally
# 7. Complete when all subtasks done
```

---

### Example 2: Architecture Analysis

```bash
opencode --agent OpenAgent
> "Analyze the architecture of this codebase and suggest improvements"

# OpenAgent will:
# 1. Scan codebase structure
# 2. Identify patterns and anti-patterns
# 3. Propose architectural improvements
# 4. Wait for approval
# 5. Implement approved changes
# 6. Validate with build and tests
```

---

### Example 3: Pattern Implementation

```bash
opencode --agent OpenAgent
> "Implement the repository pattern for all database access across the data layer"

# OpenAgent will:
# 1. Identify all database access points
# 2. Design repository interface
# 3. Propose implementation plan
# 4. Wait for approval
# 5. Delegate to @task-manager (multi-file)
# 6. Implement repositories incrementally
# 7. Update all consumers
# 8. Add tests via @tester
# 9. Validate complete implementation
```

---

### Example 4: Complex Feature

```bash
opencode --agent OpenAgent
> "Implement user authentication with JWT, refresh tokens, and role-based access control"

# OpenAgent will:
# 1. Analyze requirements (complex, multi-file)
# 2. Design authentication architecture
# 3. Propose implementation plan (multiple phases)
# 4. Wait for approval
# 5. Delegate to @task-manager (create subtasks)
# 6. Implement Phase 1: JWT infrastructure
# 7. Implement Phase 2: Refresh token mechanism
# 8. Implement Phase 3: RBAC system
# 9. Coordinate with @tester for test coverage
# 10. Coordinate with @reviewer for security review
# 11. Validate end-to-end
```

---

## Tips for Best Results

### 1. Be Specific About Scope
**Good:** "Refactor the API layer to use dependency injection in controllers and services"
**Bad:** "Make the code better"

### 2. Provide Context
If refactoring existing code, mention:
- Number of files involved
- Current patterns being used
- Desired end state
- Any constraints (can't change X, must maintain Y)

### 3. Review Plans Carefully
OpenAgent will show you the plan before implementation. Take time to:
- Verify the approach makes sense
- Check that all files are included
- Ensure edge cases are considered
- Request changes if needed

### 4. Let OpenAgent Delegate
Don't manually delegate to subagents. OpenAgent knows when to:
- Use @task-manager for breakdown
- Call @tester for tests
- Use @reviewer for security
- Leverage @coder-agent for simple tasks

### 5. Use Test-Driven Development
If a `tests/` directory exists, OpenAgent will:
- Write tests first (when appropriate)
- Validate against tests continuously
- Ensure comprehensive coverage

### 6. Trust Incremental Implementation
OpenAgent implements **one step at a time**, not all at once. This:
- Catches errors early
- Allows for course correction
- Maintains working code between steps
- Makes debugging easier

### 7. Language-Specific Conventions
OpenAgent adapts to your language:
- For TypeScript: Functional, type-first approach
- For Python: Pythonic patterns, type hints
- For Go: Idiomatic Go, interfaces
- For Rust: Ownership, traits, Result types
- For C#: Minimal APIs, CQRS (MediatR), records, async/await, nullable reference types

---

## Configuration

OpenAgent is configured in `.opencode/agent/core/openagent.md`. Default settings:

```yaml
temperature: 0.1  # Deterministic, precise
tools: read, edit, write, grep, glob, bash, patch
permissions:
  bash: Limited (ask for risky commands)
  edit: Deny secrets, node_modules, .git
```

---

## OpenAgent Development Routing

| Need | OpenAgent internal route |
|------|--------------------------|
| Multi-file implementation | CoderAgent, TaskManager, ContextScout |
| Architecture/refactoring | ContextScout, SystemArchitectAgent, TechLeadAgent |
| Tests | TestEngineer |
| Review | CodeReviewer, SecurityAgent |
| Build validation | BuildAgent |
| Swarm work | SwarmOrchestrator |

---

## Summary

OpenAgent is your **single user-facing development partner** for:
- ✅ Complex multi-file coding tasks
- ✅ Architecture analysis and improvements
- ✅ Pattern implementation and refactoring
- ✅ Deep technical implementations

OpenAgent is retained for compatibility, but new workflows should start with OpenAgent.

**Start here:**
```bash
opencode --agent OpenAgent
> "Your complex coding task..."
```

---

**Learn more:**
- [OpenAgent Guide](openagent.md) - General tasks and coordination
- [Agent System Blueprint](../features/agent-system-blueprint.md) - Architecture patterns
- [Research-Backed Design](research-backed-prompt-design.md) - Why it works
