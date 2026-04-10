# Feature Specification: OpenClaw Skill Market Listing

**Feature Branch**: `002-skill-market-listing`
**Created**: 2026-04-10
**Status**: Draft
**Input**: Publish SoloFlow as a discoverable/installable skill on the OpenClaw Skill Market (clawhub.ai)

## User Scenarios & Testing

### User Story 1 - SoloFlow developer publishes skill to market (Priority: P1)

A SoloFlow contributor wants to make the plugin discoverable so other OpenClaw users can install it with one command.

**Why this priority**: Without publishing, the skill only reaches users who manually find the GitHub repo. Market listing enables organic discovery and dramatically lowers installation friction.

**Independent Test**: Can be validated by running the clawhub publish command and confirming the skill appears on clawhub.ai with correct metadata.

**Acceptance Scenarios**:

1. **Given** a valid SoloFlow skill manifest (SKILL.md + config.json), **When** the contributor runs the publish command, **Then** the skill is listed on clawhub.ai with name, description, category, and version.

2. **Given** the skill is published, **When** a contributor pushes a new version tag, **Then** the market listing reflects the updated version.

3. **Given** the skill has incomplete metadata (missing description or category), **When** the contributor attempts to publish, **Then** the system rejects with specific validation errors.

---

### User Story 2 - OpenClaw user discovers and installs SoloFlow (Priority: P1)

An OpenClaw user searches for workflow automation skills and finds SoloFlow listed.

**Why this priority**: Discovery is the primary value proposition of the market listing. If users can't find it, the listing has no impact.

**Independent Test**: Can be validated by searching clawhub for "soloflow" and confirming it appears in results with correct metadata.

**Acceptance Scenarios**:

1. **Given** SoloFlow is published, **When** a user runs `skillhub search soloflow`, **Then** the skill appears with name, one-line description, version, and download count.

2. **Given** SoloFlow is published, **When** a user runs `clawhub install soloflow`, **Then** the skill files are downloaded, installed in the user's skills directory, and ready to use without additional configuration.

3. **Given** SoloFlow is published, **When** a user browses the "workflow" or "automation" category on clawhub.ai, **Then** SoloFlow appears in the listing.

---

### User Story 3 - Skill listing stays current with new releases (Priority: P2)

The market listing automatically reflects the latest SoloFlow version and release notes.

**Why this priority**: Outdated listings erode trust. Users who install an old version and encounter bugs won't know a newer version exists.

**Independent Test**: Can be validated by publishing v0.8, then publishing v0.9, and confirming the market listing shows v0.9.

**Acceptance Scenarios**:

1. **Given** SoloFlow v0.8 is published, **When** a new release v0.9.0 is tagged and published, **Then** the market listing version field updates to v0.9.0 and release notes are visible.

2. **Given** a user installed SoloFlow yesterday, **When** they run `skillhub upgrade soloflow`, **Then** they receive the latest published version.

---

### User Story 4 - Contributors can manage the listing post-publish (Priority: P3)

SoloFlow maintainers can update metadata, deprecate, or unpublish the listing.

**Why this priority**: Listing maintenance is essential for long-term sustainability, especially when winding down a project or correcting errors.

**Independent Test**: Can be validated by updating the description via publish command and confirming the change appears on clawhub.ai.

**Acceptance Scenarios**:

1. **Given** SoloFlow is published, **When** a maintainer updates the description and re-publishes, **Then** the market listing reflects the new description.

2. **Given** SoloFlow is published, **When** a maintainer runs the unpublish command, **Then** the skill is removed from clawhub.ai and existing installations remain functional but no longer receive update notifications.

---

### Edge Cases

- What happens when the GitHub repo is renamed or transferred? The market listing should remain functional, with the new repo URL updatable.
- How does the market handle concurrent publishes of the same version? The second publish should be rejected with a version conflict error.
- What if the skill has security vulnerabilities discovered after publication? The market should support marking a version as deprecated/untrusted.

## Requirements

### Functional Requirements

- **FR-001**: The skill manifest (SKILL.md) MUST contain: name, description (≥20 chars), category, version, author, and at least one trigger phrase.
- **FR-002**: The publish command MUST validate the manifest against clawhub's schema before submission.
- **FR-003**: The market listing MUST display: skill name, version, one-line description, author, category, trigger phrases, and installation count.
- **FR-004**: The market MUST support version-based search so users can find specific releases.
- **FR-005**: The install command MUST place skill files in the OpenClaw skills directory with correct structure.
- **FR-006**: The market MUST support the following categories relevant to SoloFlow: "workflow", "automation", "productivity", "ai-agent".
- **FR-007**: The publish command MUST authenticate the contributor (via GitHub token or equivalent).
- **FR-008**: The market MUST expose a CLI search interface (`skillhub search <query>`) accessible from the terminal.

### Key Entities

- **Skill Manifest**: Metadata file describing the skill (name, description, triggers, version, author). Stored as SKILL.md in the skill root.
- **Market Listing**: The published record on clawhub.ai representing the skill with its current version and metadata.
- **Contributor**: The authenticated user who publishes or manages the listing.
- **Installer**: The OpenClaw user who discovers and installs the skill via market CLI.
- **Release**: A specific version of the skill (version tag) with associated release notes.

## Success Criteria

### Measurable Outcomes

- **SC-001**: SoloFlow appears in clawhub.ai search results for "workflow" and "soloflow" queries within 1 hour of publication.
- **SC-002**: Users can install SoloFlow via `clawhub install soloflow` or `skillhub install soloflow` in under 2 minutes on a standard OpenClaw setup.
- **SC-003**: The market listing displays all required metadata fields (name, description, category, version, triggers) correctly formatted.
- **SC-004**: At least 5 successful installations are tracked on the market listing within 30 days of publication.
- **SC-005**: The skill listing version updates automatically when a new GitHub release is tagged, with update visible within 24 hours.
- **SC-006**: Contributor can update listing metadata and see changes reflected on clawhub.ai within 1 hour.

## Assumptions

- The OpenClaw skill market (clawhub.ai) is the intended publication target and supports the `clawhub` CLI for publishing and installation.
- SoloFlow's existing SKILL.md structure is compatible with clawhub's manifest format (or can be adapted without breaking existing OpenClaw integration).
- The publication process does not require manual approval — it's automated via CLI.
- clawhub supports GitHub-based authentication (OAuth or token) for publishing.
- Existing clawhub users have `clawhub` or `skillhub` CLI installed and configured.
- The SoloFlow repository is public on GitHub (required for market listing).
