# Quickstart: Publish SoloFlow to clawhub

## Prerequisites

- [ ] `clawhub` CLI installed (`npm install -g clawhub` or `brew install clawhub`)
- [ ] GitHub account with push access to SoloFlow repo
- [ ] `clawhub login` completed (opens browser for OAuth)

## Steps

### 1. Prepare the skill folder

Ensure `openclaw-plugin/SKILL.md` exists with valid frontmatter:

```yaml
---
name: soloflow
description: "AI-powered workflow automation with memory and self-evolution. Create, execute, and continuously improve multi-step tasks."
---
```

Add at least one usage section with examples.

### 2. Authenticate

```bash
clawhub login
# Opens browser — complete GitHub OAuth
clawhub whoami  # Confirm: "Logged in as <username>"
```

### 3. Publish

```bash
cd openclaw-plugin
clawhub publish . --version 0.8.0
# → Published: soloflow v0.8.0
# → URL: https://clawhub.ai/skills/soloflow
```

### 4. Verify

```bash
clawhub search soloflow
# → soloflow  SoloFlow
# → Summary: AI-powered workflow automation...

clawhub inspect soloflow
# → Full metadata, versions, install count
```

### 5. Install (test from another machine/user)

```bash
clawhub install soloflow
# → Installed to ./skills/soloflow/
```

---

## Automate on Release (GitHub Actions)

```yaml
# .github/workflows/publish-skill.yml
on:
  push:
    tags:
      - 'v*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish to clawhub
        env:
          CLAWHUB_TOKEN: ${{ secrets.CLAWHUB_TOKEN }}
        run: |
          cd openclaw-plugin
          VERSION=${GITHUB_REF#refs/tags/v}
          clawhub publish . --version $VERSION --changelog "See https://github.com/SonicBotMan/SoloFlow/releases/tag/v$VERSION"
```

Create `CLAWHUB_TOKEN` secret in repo Settings → Secrets.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `EINAUTH` | Run `clawhub login` |
| `ECONFLICT` | Slug taken — use `--slug soloflow-sonicbot` |
| `EINVALID_MANIFEST` | Check SKILL.md frontmatter: name + description required |
| Network timeout | Retry; check firewall/proxy |
