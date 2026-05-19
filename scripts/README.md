# VINTRACK Project Management Scripts

Operational scripts for the VINTRACK JSON-based project management system.

## Quick Start

```bash
npm run pm:validate     # Validate all JSON against schemas
npm run pm:status       # Terminal dashboard
npm run pm:report       # Markdown report
npm run pm:assess       # Ticket structural assessment
```

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `validate-pm.js` | `npm run pm:validate` | Schema + cross-reference validation for all PM artifacts |
| `pm-status.js` | `npm run pm:status` | Colorful CLI status dashboard |
| `pm-report.js` | `npm run pm:report` | Generate Markdown/JSON project reports |
| `pm-assess.js` | `npm run pm:assess` | Assess ticket health against actual codebase |

## Detailed Documentation

See [`project-knowledge/pm-scripts-reference.md`](../project-knowledge/pm-scripts-reference.md) for:
- Full usage examples
- Exit codes
- CI integration
- Troubleshooting
- Common workflows

## Data Sources

All scripts read from `../project-management/data/` and validate against `../project-management/schemas/`.
