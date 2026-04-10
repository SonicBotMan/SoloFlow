# Data Model: OpenClaw Skill Market Listing

## Entities

### SkillPackage

The folder structure that gets published to the market. Corresponds to what `clawhub publish <path>` ingests.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Skill identifier (slug format: lowercase, hyphenated) |
| `description` | string | Yes | One-line summary (20–200 chars) |
| `version` | string | Yes | Semver string (e.g., "0.8.0") |
| `author` | string | Yes | Author name or GitHub handle |
| `content` | markdown | Yes | SKILL.md body with usage examples and guidance |
| `tags` | string[] | No | Searchable tags (default: ["latest"]) |

**Relationships**: A SkillPackage is the source for one or more SkillVersion entries on the market.

---

### SkillListing

The published record on clawhub.ai. Created when `clawhub publish` succeeds.

| Field | Source | Description |
|-------|--------|-------------|
| `slug` | derived from name | URL-safe identifier |
| `displayName` | from name field | Human-readable name |
| `summary` | from description | One-line description shown in search |
| `owner` | from auth | GitHub user who published |
| `latestVersion` | from publish | Current version string |
| `tags` | from publish | All published versions |
| `installCount` | market | Number of successful installs |
| `createdAt` | market | First publish timestamp |
| `updatedAt` | market | Most recent publish timestamp |

**Relationships**: Owned by one Contributor. Has many SkillVersion entries.

---

### SkillVersion

A specific semver release of a skill.

| Field | Source | Description |
|-------|--------|-------------|
| `version` | from --version | Semver (e.g., "0.8.0") |
| `changelog` | from --changelog | Release notes |
| `publishedAt` | market | Version publish timestamp |
| `isLatest` | market | Whether this is the newest version |

**Relationships**: Belongs to one SkillListing. Tagged and referenced by install command.

---

### Contributor

The authenticated user who publishes or manages a listing.

| Field | Source | Description |
|-------|--------|-------------|
| `githubId` | auth | GitHub user ID |
| `username` | auth | GitHub username |
| `token` | auth | clawhub auth token (stored locally) |

**Relationships**: Owns one or more SkillListing entries.

---

### Installer

An OpenClaw user who installs a skill from the market.

| Field | Source | Description |
|-------|--------|-------------|
| `openClawVersion` | detected | OpenClaw version installed |
| `installPath` | config | Where skill was installed |

**Relationships**: Triggers install count increment on SkillListing.

---

## Validation Rules

1. `name` must be unique on the market (no two skills with same slug)
2. `version` must follow semver and be higher than any previously published version for the same slug
3. `description` must be 20–200 characters
4. `content` (SKILL.md body) must contain at least one code example or usage instruction
5. Contributor must be authenticated (valid clawhub token) at time of publish
6. Forked skills (`--fork-of`) cannot re-use the original slug

---

## State Transitions

```
[Local folder] --publish--> [SkillVersion v0.8.0] ---> [SkillListing (latest=v0.8.0)]
                                    |
                          [new tag + publish]
                                    |
                                    v
                         [SkillVersion v0.9.0]
                                    |
                                    v
                         [SkillListing (latest=v0.9.0)]
```

- SkillListing is **created** on first publish
- SkillListing is **updated** (latestVersion, updatedAt) on each subsequent publish
- SkillListing can be **hidden** or **deleted** by owner/moderator (soft-delete; installations remain functional)
- SkillListing can be **restored** after deletion
