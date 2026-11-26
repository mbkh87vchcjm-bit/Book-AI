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

After a local dependency inventory has been collected, the dashboard can export a CycloneDX 1.7 JSON document. The generated file is explicitly marked as a partial pre-build manifest inventory. Exact versions from lockfiles are emitted as versions; ranges and workspace selectors are preserved as declared-version properties. Runtime scope is assigned only when manifest or lockfile evidence supports it; when the relationship is unknown, the SBOM omits the scope rather than guessing. A manifest declaration is linked to a locked component only when the version matches exactly. Unmatched pins and ranges remain separate declaration components with an explicit resolution-status property; the exporter does not claim that a SemVer range is satisfied without validating it.

This is not a complete build SBOM or Software Composition Analysis result. It does not resolve dependency graphs, include package hashes or PURLs, identify licenses, or match packages against a vulnerability feed. It makes no network requests. The export is created from the latest successful scan retained in the main process; the renderer cannot supply or replace the report being exported. Use the file as a starting inventory for a separate review, not as evidence that the dependencies are safe.


Scan lifecycle protection: changing the project or saving policy settings invalidates old reports. If an in-flight scan finishes after the project, policy, or scan generation changes, its result is discarded and cannot become the export source.


## Phase 2 — Offline AI and tool intelligence

- The local registry contains 209 unique tool entries across 19 categories from the research inventory.
- 28 entries have an initial high-level knowledge summary. Other entries are marked as needing documentation review; this is not a claim that every tool has been fully studied.
- Tool execution remains disabled for every catalogue entry. The catalogue is reference-only in this phase.
- The local assistant uses an already-installed Ollama model through the fixed endpoint http://127.0.0.1:11434. It does not accept a configurable remote endpoint and does not fall back to cloud inference.
- The Electron renderer denies HTTP, HTTPS, WebSocket, and secure WebSocket requests. Its Content Security Policy also denies network connections.
- Midad does not download models, rules, tool binaries, or vulnerability databases. Prepare these separately using institution-approved media and verify provenance and hashes before import.
- Model answers are generated locally and must be checked by a researcher. Incomplete tool records are marked as such.

### Ollama local-only configuration on Windows

Before the workstation is disconnected from the internet:
1. Set the user environment variable OLLAMA_NO_CLOUD=1.
2. Set OLLAMA_HOST=127.0.0.1:11434 so the service listens only on loopback.
3. Quit and restart Ollama so it reads the new settings.
4. Confirm that an already-installed local model appears in Midad's local assistant page.
5. Use Windows Defender Firewall and institutional endpoint policy to block outbound traffic when full isolation is required.

These application controls do not by themselves create a physical air gap. A genuinely isolated workstation also requires network isolation at the operating-system and network layers. Model, rule, and database updates must use a separate controlled import process.

Ollama's official FAQ documents OLLAMA_NO_CLOUD=1 for disabling cloud features and states that the default server bind address is 127.0.0.1:11434.
