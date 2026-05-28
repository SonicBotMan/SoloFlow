# Contributing to SoloFlow

Thank you for your interest in contributing to SoloFlow! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

- Check if the bug has already been reported in [Issues](https://github.com/SonicBotMan/SoloFlow/issues)
- If not, create a new issue with:
  - Clear title and description
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (OS, Python version)

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the feature and its use case
- Explain why it would be valuable

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Commit your changes (`git commit -m 'feat: add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/SoloFlow.git
cd SoloFlow

# No dependencies needed - pure Python!

# Run tests
python -m pytest tests/ -v
```

## Code Style

### Python

- Follow PEP 8
- Use type hints where appropriate
- Write docstrings for public functions and classes
- Keep functions focused and small

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (no logic change)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:
```
feat(memory): add Ebbinghaus forgetting curve implementation
fix(dag): correct cycle detection in complex graphs
docs(readme): update quick start guide
test(routing): add unit tests for TaskClassifier
```

## Testing

### Running Tests

```bash
# All tests
python -m pytest tests/ -v

# Specific module
python -m pytest tests/mcp/ -v
python -m pytest tests/trace/ -v

# With coverage
pip install pytest-cov
python -m pytest tests/ --cov=hermes_plugin --cov-report=html
```

### Writing Tests

- Place tests in the `tests/` directory
- Mirror the source structure (e.g., `tests/mcp/test_mcp_tools.py`)
- Use descriptive test names
- Test both success and failure cases
- Use fixtures for common setup

Example:

```python
import pytest
from mcp.registry import MCPToolRegistry

@pytest.fixture
def registry():
    return MCPToolRegistry()

def test_register_tool(registry):
    async def handler(**kwargs):
        return {"result": "ok"}
    
    registry.register(
        name="test_tool",
        description="A test tool",
        input_schema={"type": "object", "properties": {}},
        handler=handler,
    )
    
    tools = registry.list_tools()
    assert len(tools) == 1
    assert tools[0]["name"] == "test_tool"
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new functionality
3. **Ensure CI passes** - all tests must pass
4. **Request review** from maintainers
5. **Address feedback** promptly
6. **Squash commits** if requested

### PR Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Test addition

## Testing

- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] Manual testing performed

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## Architecture Guidelines

### Adding a New Module

1. Create directory: `your_module/`
2. Add `__init__.py` with exports
3. Add `README.md` with usage examples
4. Add tests in `tests/your_module/`
5. Update main `README.md`

### ETCLOVG Alignment

When adding features, consider which ETCLOVG layer they belong to:

- **E** (Execution) - Runtime, sandboxes, isolation
- **T** (Tool Interface) - MCP, tool protocols
- **C** (Context) - Memory, knowledge management
- **L** (Lifecycle) - Orchestration, state machines
- **O** (Observability) - Tracing, logging, metrics
- **V** (Verification) - Testing, evaluation, quality
- **G** (Governance) - Security, permissions, audit

## Questions?

Feel free to open an issue or reach out to the maintainers.

---

Thank you for contributing to SoloFlow! 🚀
