# SoloFlow Code Review Checklist

## Code Quality

- [ ] All functions have type hints
- [ ] All public functions have docstrings
- [ ] No unused imports
- [ ] No code duplication
- [ ] Error handling is appropriate
- [ ] Logging is appropriate

## Testing

- [ ] Unit tests for all new functions
- [ ] Edge case tests
- [ ] Performance tests for critical paths
- [ ] Integration tests for workflows
- [ ] All tests pass

## Documentation

- [ ] README updated
- [ ] API documentation updated
- [ ] Examples updated
- [ ] CHANGELOG updated

## ETCLOVG Alignment

- [ ] E (Execution) - Runtime, sandboxes
- [ ] T (Tool Interface) - MCP tools
- [ ] C (Context) - Memory, knowledge
- [ ] L (Lifecycle) - DAG+FSM orchestration
- [ ] O (Observability) - Trace system
- [ ] V (Verification) - Quality scoring
- [ ] G (Governance) - Permissions, audit

## Performance

- [ ] No N+1 queries
- [ ] Efficient algorithms
- [ ] Memory usage acceptable
- [ ] Response times acceptable
