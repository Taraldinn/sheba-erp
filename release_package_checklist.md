# Production Release Package Checklist

Before generating the final release build, ensure the following files and directories are excluded to prevent test data, logs, or diagnostic scripts from leaking into production.

## Excluded Directories
- `scratch/` - Temporary workspace files
- `tmp/` - Runtime temporary processing files
- `tools/private/` - Internal development tools
- `backup/` (If containing existing backups; script ensures empty on deploy)
- `storage/` (If containing sensitive dev uploads; only deploy structure)

## Excluded File Patterns
- `debug_*.php` - Local debugging scripts
- `test_*.php` - Automated or manual test scripts
- `check_*.php` - Local diagnostic checks
- `verify_*.php` - Local verification endpoints
- `fix_*.php` - One-off hotfix scripts
- `*.log` - All log files (e.g. `php_error.log`, `app.log`)
- `*.sql` - Database dump files

## Excluded Environment/Git
- `.env` - Development environment configuration
- `.git/` - Source control repository history

*Note: The `build_release.ps1` script has been configured to enforce these exclusions automatically.*
