# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.3.x | ✅ |
| 1.2.x | ✅ |
| 1.1.x | ✅ |
| 1.0.x | ✅ |
| < 1.0 | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in SoloFlow, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue
2. Email security concerns to: [your-email]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix Release**: Within 2 weeks (for critical issues)

## Security Features

### Governance Layer (G)
- Permission-based access control
- Audit logging for all operations
- Security policy enforcement
- Rate limiting and timeouts

### Best Practices

- All inputs are validated
- SQL queries use parameterized statements
- No hardcoded credentials
- Dependencies are regularly updated

## Dependency Security

SoloFlow has **zero external dependencies** (pure Python standard library), which significantly reduces the attack surface.

### Internal Dependencies
- `sqlite3` - Built-in Python module
- `asyncio` - Built-in Python module
- `json` - Built-in Python module
- `logging` - Built-in Python module

## Security Checklist

- [x] Input validation
- [x] SQL injection prevention
- [x] No hardcoded secrets
- [x] Audit logging
- [x] Permission system
- [x] Rate limiting
- [x] Timeout handling
- [x] Error handling without information leakage
