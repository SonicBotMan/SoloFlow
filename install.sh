#!/usr/bin/env bash
# SoloFlow — Hermes Installation Script
# ======================================
# Installs the SoloFlow meta-skill and plugin into your Hermes config.
# Replaces skill-factory with deeper integration and quality scoring.

set -euo pipefail

HERMES_DIR="${HERMES_DIR:-$HOME/.hermes}"
SKILLS_DIR="$HERMES_DIR/skills"
PLUGINS_DIR="$HERMES_DIR/plugins"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${GREEN}[soloflow]${NC} $*"; }
warn()    { echo -e "${YELLOW}[soloflow]${NC} $*"; }
error()   { echo -e "${RED}[soloflow]${NC} $*" >&2; exit 1; }
step()    { echo -e "${BLUE}[soloflow]${NC} $*"; }

# ------------------------------------------------------------------
# Pre-flight checks
# ------------------------------------------------------------------

step "🔍 Checking prerequisites..."

if [ ! -d "$HERMES_DIR" ]; then
  error "Hermes config directory not found at $HERMES_DIR. Is Hermes installed?"
fi

# Check Python version
if ! command -v python3 &> /dev/null; then
  error "Python 3 is required but not installed."
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
  error "Python 3.10+ is required. Found: $PYTHON_VERSION"
fi

info "Python $PYTHON_VERSION ✓"

# ------------------------------------------------------------------
# Install the meta-skill (SKILL.md)
# ------------------------------------------------------------------

step "📦 Installing meta-skill..."

SKILL_DEST="$SKILLS_DIR/meta/soloflow"
mkdir -p "$SKILL_DEST"

if [ -f "$SKILL_DEST/SKILL.md" ]; then
  warn "SKILL.md already exists at $SKILL_DEST/SKILL.md — overwriting."
fi

cp skills/meta/soloflow/SKILL.md "$SKILL_DEST/SKILL.md"
info "Installed: $SKILL_DEST/SKILL.md"

# ------------------------------------------------------------------
# Install the plugin
# ------------------------------------------------------------------

step "🔌 Installing plugin..."

mkdir -p "$PLUGINS_DIR"

if [ -f "$PLUGINS_DIR/soloflow.py" ]; then
  warn "plugin already exists at $PLUGINS_DIR/soloflow.py — overwriting."
fi

cp plugins/soloflow.py "$PLUGINS_DIR/soloflow.py"
info "Installed: $PLUGINS_DIR/soloflow.py"

# ------------------------------------------------------------------
# Install evolution module
# ------------------------------------------------------------------

step "🧬 Installing evolution module..."

# Create evolution directory in Hermes plugin directory
EVOLUTION_DIR="$PLUGINS_DIR/../evolution"
mkdir -p "$EVOLUTION_DIR"

# Copy evolution module files
cp evolution/__init__.py "$EVOLUTION_DIR/"
cp evolution/pattern_detector.py "$EVOLUTION_DIR/"
cp evolution/skill_packager.py "$EVOLUTION_DIR/"
cp evolution/quality_scorer.py "$EVOLUTION_DIR/"

info "Installed: evolution module"

# ------------------------------------------------------------------
# Verify installation
# ------------------------------------------------------------------

step "✅ Verifying installation..."

# Check if files exist
MISSING=0

if [ ! -f "$SKILL_DEST/SKILL.md" ]; then
  warn "Missing: $SKILL_DEST/SKILL.md"
  MISSING=$((MISSING + 1))
fi

if [ ! -f "$PLUGINS_DIR/soloflow.py" ]; then
  warn "Missing: $PLUGINS_DIR/soloflow.py"
  MISSING=$((MISSING + 1))
fi

if [ ! -f "$EVOLUTION_DIR/__init__.py" ]; then
  warn "Missing: $EVOLUTION_DIR/__init__.py"
  MISSING=$((MISSING + 1))
fi

if [ $MISSING -gt 0 ]; then
  error "Installation incomplete. $MISSING files missing."
fi

# Test Python imports
if python3 -c "import sys; sys.path.insert(0, '$PLUGINS_DIR/..'); from evolution.pattern_detector import PatternDetector" 2>/dev/null; then
  info "Evolution module imports ✓"
else
  warn "Evolution module import test failed. Dependencies may be missing."
fi

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "⚡ SoloFlow installed successfully!"
echo ""
echo "  Skills dir:  $SKILL_DEST/"
echo "  Plugin:      $PLUGINS_DIR/soloflow.py"
echo "  Evolution:   $EVOLUTION_DIR/"
echo ""
echo "  Next steps:"
echo "    1. Restart Hermes or run: hermes skills reload"
echo "    2. Activate the skill:    hermes skills enable soloflow"
echo "    3. Start a session and let SoloFlow watch"
echo "    4. Run: /soloflow propose   — to surface detected skills"
echo ""
echo "  Commands:"
echo "    /soloflow propose          — Analyze session and propose top skill"
echo "    /soloflow generate <name>  — Generate and install a skill"
echo "    /soloflow list             — List all detected patterns"
echo "    /soloflow skills           — List all generated skills"
echo "    /soloflow status           — Show tracking status"
echo "    /soloflow queue            — Show pending proposals"
echo "    /soloflow clear            — Clear session log"
echo ""
echo "  Natural language:"
echo "    'Save this as a skill'"
echo "    'Remember how to do this'"
echo "    'Turn this workflow into a reusable skill'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
