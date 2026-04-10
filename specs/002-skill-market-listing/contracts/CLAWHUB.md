# Contract: clawhub CLI Publish Interface

## Overview

SoloFlow publishes to the OpenClaw Skill Market via the `clawhub publish` CLI command. This document defines the contract between SoloFlow's publishable skill folder and clawhub's submission API.

---

## CLI Contract: `clawhub publish`

### Command

```bash
clawhub publish <path> [options]
```

### Inputs

| Argument/Option | Type | Required | Description |
|-----------------|------|----------|-------------|
| `<path>` | string (path) | Yes | Path to skill folder containing SKILL.md |
| `--slug <slug>` | string | No | Override the auto-generated URL slug |
| `--name <name>` | string | No | Override the display name |
| `--version <version>` | semver | No | Override version (auto-detected from folder preferred) |
| `--fork-of <slug[@ver]>` | string | No | Mark as fork of existing skill |
| `--changelog <text>` | string | No | Release notes for this version |
| `--tags <tags>` | csv string | No | Comma-separated tags (default: "latest") |

### Preconditions (Validation before API call)

1. `<path>` must exist and be a directory
2. `<path>/SKILL.md` must exist and contain valid YAML frontmatter with `name` and `description`
3. `description` in frontmatter must be 20–200 characters
4. Auth token must be valid and stored locally (`~/.config/clawhub/token` or env `CLAWHUB_TOKEN`)

### Outputs

**Success** (exit code 0):
```
Published: <slug> v<version>
URL: https://clawhub.ai/skills/<slug>
```

**Failure** (exit code != 0):
- `EINAUTH`: Not logged in — run `clawhub login` first
- `EINVALID_MANIFEST`: SKILL.md missing required fields
- `ECONFLICT`: Slug already taken
- `ENOTFOUND`: Path does not exist
- `ENETWORK`: Network error reaching registry

---

## File Contract: SKILL.md Format

### Required Frontmatter

```yaml
---
name: "<slug>"          # lowercase, hyphenated, unique on market
description: "<text>"   # 20–200 chars, shown in search results
---
```

### Optional Frontmatter Fields

```yaml
---
name: "soloflow"
description: "AI-powered workflow automation with memory and self-evolution"
version: "0.8.0"      # shown in listing; defaults to git tag or "0.0.0"
author: "SonicBotMan"  # shown in listing
tags:                   # comma-separated in CLI, array here
  - latest
  - workflow
---
```

### Body (markdown)

Free-form markdown documenting:
- What the skill does (1–2 paragraphs)
- Key commands or trigger phrases
- Usage examples (code blocks preferred)
- Any configuration or prerequisites

**Minimum body requirement**: At least one `## Heading` section and one code block or instruction.

---

## CLI Contract: `clawhub search`

### Command

```bash
clawhub search <query...>
```

### Outputs

```
<slug>  <display name>
Summary: <description>
Version: <latest version>  |  Author: <author>

[<slug>  ...]
```

---

## CLI Contract: `clawhub install`

### Command

```bash
clawhub install <slug> [--dir <path>]
```

### Outputs

```
Installing <slug> v<version>...
Installed to <path>/<slug>/
```

The installer places `<slug>/SKILL.md` and all files from the published folder into `<path>/<slug>/`.

---

## API Contract: Registry (for reference)

If integrating programmatically rather than via CLI:

```
POST /skills/publish
Headers: Authorization: Bearer <token>
Body: multipart/form-data { files: [< SKILL.md, other files >], metadata: {...} }

GET /skills/search?q=<query>
Response: { results: [{ slug, name, description, version, author, installCount }] }

GET /skills/<slug>
Response: { slug, name, description, versions: [...], author, createdAt, updatedAt }
```

---

## Integration Points with SoloFlow

| SoloFlow Component | Interface | Notes |
|-------------------|----------|-------|
| `openclaw-plugin/` folder | `<path>` for `clawhub publish` | Must contain SKILL.md |
| `openclaw-plugin/SKILL.md` | manifest file | Must have valid frontmatter + body |
| `openclaw-plugin/package.json` | version source | Extract version for `--version` |
| GitHub release tags | `--changelog` source | Auto-generate from CHANGELOG.md or git log |
| GitHub Actions CI | automation | Publish automatically on version tag push |
