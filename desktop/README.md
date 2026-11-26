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


## Windows installer build

The repository's Windows CI job creates two unsigned x64 artifacts:
- Midad-Cyber-Setup-<version>-x64.exe — interactive NSIS installer.
- Midad-Cyber-Portable-<version>-x64.exe — portable executable.

To build locally from this directory:

```powershell
npm install
npm run dist:win
```

Build output is written to desktop/release/. The installer is intentionally unsigned in this development phase. Windows may display a publisher or SmartScreen warning because no production code-signing certificate has been configured. Do not treat an unsigned development artifact as a verified public release.

The CI workflow builds on a Windows runner; Linux CI does not cross-compile this Windows package. The installer must still be exercised on a clean Windows 11 account and a second Windows 10/11 environment before release.


### Structural JavaScript / TypeScript analysis

The desktop package embeds the pinned @babel/parser runtime dependency and enables a local AST-based review for JavaScript, JSX, TypeScript, and TSX files. It identifies selected structural patterns such as dynamic evaluation, dynamic HTML assignment, and request-derived SQL string construction. Parsing builds a syntax tree only and does not execute source code. Parse failures and node limits become bounded warnings. These findings are heuristic indicators, not proof of exploitability.


The Windows CI artifact also contains `SHA256SUMS.txt`. On PowerShell, verify an EXE with `Get-FileHash .\\Midad-Cyber-Setup-<version>-x64.exe -Algorithm SHA256` and compare the `Hash` value with the matching line in the checksum file. A matching hash verifies file integrity against that manifest; it does not authenticate the publisher because these development artifacts are unsigned.


## CycloneDX SBOM export

After a local dependency inventory has been collected, the dashboard can export a CycloneDX 1.7 JSON document. The generated file is explicitly marked as a partial pre-build manifest inventory. Exact package versions from lockfiles are emitted as versions; ranges and workspace selectors remain declared-version properties rather than being mislabeled as resolved versions.

This is not a complete build SBOM or Software Composition Analysis result. It does not resolve dependency graphs, include package hashes or PURLs, identify licenses, or match packages against a vulnerability feed. It makes no network requests. Use the file as a starting inventory for a separate review, not as evidence that the dependencies are safe.
