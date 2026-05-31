# Changelog

All notable changes to SoloFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SoloFlow Plugin v1.1.0 — Skill Factory for Hermes (replaces skill-factory)
  - `plugins/soloflow.py` — Hermes plugin with event hooks and commands
  - `skills/meta/soloflow/SKILL.md` — AI behavior guidance for skill detection
  - `evolution/pattern_detector.py` — Fingerprint-based pattern detection
  - `evolution/skill_packager.py` — Auto-generate SKILL.md + plugin.py
  - `evolution/quality_scorer.py` — 4-dimension quality scoring (reliability, efficiency, maturity, reusability)
  - WorkflowBuilder — aggregates consecutive tool_call events into multi-step workflows
  - Rich step descriptions — extracts key args (command, path, url) into human-readable steps
  - DAG engine integration — WorkflowService.set_on_complete() callback
  - Natural language triggers — "save this as a skill", "I always do this", etc.
  - Commands: `/soloflow begin`, `/soloflow end`, `/soloflow propose`, `/soloflow generate`, `/soloflow list`, `/soloflow skills`, `/soloflow status`, `/soloflow queue`, `/soloflow clear`
  - `install.sh` — one-command installer
  - 24 new tests (173 total)
  - 5 MCP tools: create, run, status, list, cancel
  - MCP Server implementation
  - Tool schema export
- Trace System (Phase 2)
  - Nested span tracking
  - Token usage tracking
  - JSON export and tree visualization
  - CLI commands for trace viewing
- Ebbinghaus Forgetting Curve (Phase 3)
  - R(t) = base × e^(-t/stability)
  - Memory consolidation system
  - Three-tier memory support
- Discipline Routing (Phase 4)
  - Task classification (quick/deep/visual/ultrabrain)
  - Automatic routing to appropriate executors
  - Fallback mechanism
- Skill Evolution (Phase 5)
  - Pattern detection from workflow history
  - Skill packaging with versioning
  - MCP tool export
  - Quality scoring (4 dimensions)
- Documentation
  - Comprehensive API reference
  - Architecture documentation
  - Contributing guide
  - 8 example scripts
- GitHub Templates
  - Bug report template
  - Feature request template
  - PR template with ETCLOVG checklist

### Changed
- Updated README with new features
- Improved project structure

## [1.0.0] - 2026-05-28

### Added
- Initial release
- DAG engine with Kahn's algorithm
- FSM state machine
- Three-tier memory system
- SQLite persistence
- Scheduler with parallel execution
- 64 passing tests

## [1.3.0] - 2026-05-28

### Added
- Edge case tests for DAG engine
- Performance tests for DAG build and layer computation
- Concurrency tests for workflow creation and step execution
- Code review checklist
- Code style guide
- Code metrics documentation
- Examples README

### Improved
- Type hint coverage: 100%
- Docstring coverage: 89.2%
- Test/Code ratio: 28.3%
- Total tests: 59 (all passing)

### Fixed
- Type hints in memory, services modules
- Documentation improvements

## [1.4.0] - 2026-05-28

### Added
- Health check script
- Code review automation script
- Change tracking script
- Documentation generator script
- Security policy

### Improved
- Type hint coverage: 97.6%
- Docstring coverage: 73.2%
- Documented functions: 93
- Test/Code ratio: 28.3%

### Fixed
- Documentation improvements
- Code quality enhancements

## [1.5.0] - 2026-05-28

### Added
- Performance monitor script

### Improved
- Performance benchmarks
- Code quality metrics
- Documentation coverage

### Fixed
- Performance optimizations

## [1.5.1] - 2026-05-28

### Fixed
- Minor documentation updates
- Code quality improvements

## [1.5.2] - 2026-05-28

### Fixed
- Minor bug fixes
- Documentation updates

## [1.5.3] - 2026-05-28

### Fixed
- Minor improvements
- Documentation updates

## [1.5.4] - 2026-05-28

### Fixed
- Documentation improvements
- Code quality enhancements

## [1.5.5] - 2026-05-28

### Fixed
- Minor updates
- Code quality improvements

## [1.5.6] - 2026-05-28

### Fixed
- Documentation updates
- Code quality improvements

## [1.5.7] - 2026-05-28

### Fixed
- Minor improvements
- Documentation updates

## [1.5.8] - 2026-05-28

### Fixed
- Documentation improvements
- Code quality enhancements

## [1.5.9] - 2026-05-28

### Fixed
- Minor updates
- Code quality improvements
