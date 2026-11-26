# Midad Cyber — Phase 1 Foundation

This phase adds the first Windows-first defensive cybersecurity foundation to Midad. The modules live under desktop/cyber and are not loaded by the existing Android WebView app.

## User-controlled settings

The policy module lets the user configure:
- Enable or disable the Cyber module and choose education, read-only, or review mode.
- Local project scope through relative-path allowlists and exclusions.
- Maximum file count, per-file size, total scan size, findings, and timeout.
- Enabled defensive analyzers and minimum finding severity.
- Whether remediation suggestions are enabled and whether applying a remediation is enabled.

The default profile is read-only, local-only, and does not apply changes automatically. Suggestions are non-mutating. Applying a change requires review mode, the apply-remediation capability, and explicit per-change approval.

## Fixed guardrails

The following actions remain blocked: remote/network scanning, exploit validation, credential access or dumping, stealth, persistence, security-control bypass, and executing project code. Users can configure scope and depth of defensive analysis, but cannot switch these guardrails off.

Secret-like values must be redacted before being shown, logged, or exported.

## First knowledge concepts

The bilingual concept catalogue models ambiguous terms (for example, Token) as separate concepts and uses context to disambiguate them. When there is insufficient context, it returns an ambiguous result rather than guessing.

The catalogue is a starting point, not a substitute for authoritative security references. Future ingestion should preserve source, version, publication date, and license metadata.

## Current scope and limitations

- No Semgrep binary, vulnerability database, network scanner, or LLM is bundled in this phase.
- The policy API is ready to authorize future local analyzers, but those integrations must be added and tested separately.
- File-scope checks are lexical relative-path checks at this stage. The Windows scanner must also resolve canonical filesystem paths and reject symlink/junction escapes before reading files.
- The initial concept set is deliberately small and educational.
- A Windows settings UI and persistent user preferences are the next integration tasks.
- Android remains unchanged until the Windows desktop experience is validated.

## Tests

Run npm test to execute the cyber policy and concept tests alongside the existing Midad test suite.


## Phase 1.2 — Local dependency inventory

The defensive scanner can now identify and inventory common dependency manifests and lockfiles without contacting package registries or executing project code. Initial formats include npm (package.json and package-lock), Yarn, pnpm, Python requirements / pyproject / Poetry lock, Composer, Cargo, Go modules, Bundler lockfiles, and Maven POM files.

The inventory contains package names, declared or locked version text, relationship labels where available, and source manifest paths. It intentionally omits registry URLs, integrity hashes, and other lockfile metadata. This is an inventory feature only: it does not determine whether a package version is vulnerable, supported, malicious, or safe. That requires a separately maintained vulnerability-data source and explicit provenance, freshness, and licensing controls.

The UI displays a bounded preview and JSON export retains a bounded inventory. Manifest parsing is performed from already-authorized, size-limited local files. No network lookups or package installation occur.


## Windows packaging preparation

A Windows CI job now installs the pinned Electron and electron-builder toolchain and builds both NSIS installer and portable x64 artifacts. Build artifacts are retained in GitHub Actions for a limited period and are not yet published as a release. The artifacts are unsigned because no trusted signing certificate has been configured. Before public distribution, complete Windows installation/uninstallation tests, clean-profile tests, antivirus false-positive review, application icon/branding, code signing, and a documented release checksum process.


AST report metadata also records whether the parser was available, how many JavaScript / TypeScript files were parsed, and how many files had syntax parse failures. These counters do not include source snippets and are included in JSON exports.

## Versioned cybersecurity knowledge references

The local glossary contains bilingual concept entries linked to explicit source identifiers. The current baseline includes OWASP Top 10:2025 categories and OWASP ASVS 5.0.0, plus relevant OWASP Cheat Sheet Series pages for SQL injection and XSS. The glossary is an educational index, not a certification or a substitute for reading the complete standards. Reference URLs are displayed as text; the app's network access remains disabled.

Official references:
- OWASP Top 10:2025: https://top10.owasp.org/2025/
- OWASP ASVS 5.0.0: https://asvs.owasp.org/
- OWASP SQL Injection Prevention: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- OWASP Cross Site Scripting Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

The glossary also includes XSS, CSRF, IDOR/BOLA, SSRF, session management, MFA, RBAC, input validation, CVE/CWE/CVSS, SBOM, and SCA distinctions. Automated tests ensure that each declared source identifier resolves to a versioned source record.


## Phase 1.3 — Partial CycloneDX SBOM

The dependency inventory can now be exported as CycloneDX 1.7 JSON. The document identifies itself as a partial, pre-build manifest inventory. Exact versions are separated from version constraints. Optional and development scopes are preserved when supported by manifest or lockfile evidence; unknown scope remains unset rather than being guessed. When a locked package and a declaration refer to the same package, the locked version takes precedence and the declaration constraint is retained as metadata. Source manifest paths are retained as local metadata. The exporter omits registry URLs, integrity hashes, and download metadata.

This is not a complete SBOM or SCA result. Full dependency relationships are not resolved, no PURLs or cryptographic component hashes are generated, license identification is not implemented, and no CVE feed is consulted. The app remains offline. Export handlers use the latest report retained by the Electron main process; renderer-supplied report objects are not accepted. The export must not be described as proof of safety or of vulnerability absence.



The main process binds each scan to the selected project root and a monotonically increasing scan revision. Selecting another project, saving new policy settings, or starting a newer scan invalidates prior in-flight results. Report and SBOM exports only use the last successful report retained by the main process.
