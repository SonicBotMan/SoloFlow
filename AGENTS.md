# AGENTS.md

Guidance for AI agents working in this repository.

## Cursor Cloud specific instructions

### What this repo is

SoloFlow is an AI workflow orchestration stack with two implementations:

| Area | Path | Role |
|------|------|------|
| Python engine | `hermes-plugin/` | DAG + FSM workflow engine (stdlib + embedded SQLite) |
| OpenClaw plugin | `openclaw-plugin/` | TypeScript plugin for OpenClaw Gateway (Node ≥22) |
| Marketing site | `website/` | Static HTML (no backend) |

Full agent E2E (live LLM steps, `/soloflow/builder`) requires **OpenClaw Gateway** and provider API keys outside this repo. In-cloud development focuses on the Python engine, plugin unit tests, and static site.

### Commands (from repo root)

Use **`python3`** (not `python`) — the VM may not have a `python` shim.

| Task | Command |
|------|---------|
| Python tests (149) | `python3 -m pytest tests/ -v` |
| Python tests (hermes only) | `PYTHONPATH=hermes-plugin python3 -m pytest tests/hermes-plugin/ -v` |
| Health-style check | `python3 -m pytest tests/ -q` (prefer over `scripts/health_check.sh`, which calls `python`) |
| Core demo (workflow create → complete) | `python3 examples/01_basic_workflow.py` — **note:** example currently calls removed APIs (`get_ready_steps` on `WorkflowService`); use pytest integration tests or inline engine script until example is fixed |
| OpenClaw plugin deps | `cd openclaw-plugin && npm ci` |
| Typecheck / lint (TS) | `cd openclaw-plugin && npx tsc --noEmit` |
| Build plugin | `cd openclaw-plugin && npm run build && npm run build:bundle` |
| Plugin unit tests | Install [Bun](https://bun.sh), then `cd openclaw-plugin && bun install && bun test` (~140 pass; `tests/rpc.test.ts` may error if `src/rpc/index` is absent) |
| Static website (dev) | `cd website && python3 -m http.server 8080` → http://127.0.0.1:8080/ |

### Python dependencies

Runtime engine has **zero pip dependencies**. Dev/test only:

```bash
pip install pytest pytest-asyncio
```

Ensure `~/.local/bin` is on `PATH` if `pytest` is not found.

### Gotchas

- **`scripts/health_check.sh`** invokes `python`; on this VM use `python3 -m pytest tests/ -q` instead.
- **`npm run build`** in `openclaw-plugin` may report TypeScript errors on `main` while **`bun test`** still passes for most suites.
- **OpenClaw Gateway** (default port 3000) and **Vite UI** (`openclaw-plugin/ui`, port 5180) are optional and not started by the update script.
- No Docker, Redis, or external DB server — SQLite files only.

### CI parity

See `.github/workflows/ci.yml`: Node 22 + `npm ci` + `tsc` + build for `openclaw-plugin`; Python 3.11 syntax/import checks plus inline integration script for `hermes-plugin` on push.
