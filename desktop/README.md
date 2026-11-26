# Midad Cyber for Windows

This is a Windows-first Electron desktop workspace. The Android application remains separate and unchanged until the desktop milestone is validated.

## Requirements

- Windows 10/11 x64
- Node.js 22 or newer
- npm

## Run in development

From this directory:

```powershell
npm install
npm start
```

Electron 45.5.0 is pinned in package.json. Electron's official release page lists 45.5.0 as a stable release published on 24 November 2026.

## Current capabilities

- Select one local project directory through the native Windows folder dialog.
- Read text-based source files only.
- Skip symbolic links and common generated/dependency folders.
- Enforce allowed/excluded relative paths, file limits, total size, result limits and timeout.
- Run initial built-in static indicators and optional secret-pattern checks.
- Redact detected secret values in all reports.
- Export a JSON report locally.

## Security model

- Electron renderer runs with context isolation, sandboxing, disabled Node integration, and a restrictive Content Security Policy.
- Renderer receives only a narrow IPC bridge from preload.
- No remote URLs, network scans, project execution, or file modifications are implemented.
- Findings are heuristic indicators, not proof of exploitability or proof that a project is secure.
- Before production use, canonical filesystem paths and junction/symlink boundaries must be reviewed on Windows, and the app should be code-signed and packaged reproducibly.

The root project test suite includes scanner tests. Run `npm test` from the repository root.
