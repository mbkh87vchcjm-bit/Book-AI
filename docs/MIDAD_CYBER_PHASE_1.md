# Midad Cyber — Phase 1 Foundation

This phase adds the first defensive cybersecurity foundation to Midad. It is a policy and knowledge layer, not an active penetration-testing tool.

## User-controlled settings

The policy module lets the user configure:
- Enable or disable the Cyber module and choose education, read-only, or review mode.
- Local project scope through relative-path allowlists and exclusions.
- Maximum file count, per-file size, total scan size, findings, and timeout.
- Enabled defensive analyzers and minimum finding severity.
- Whether remediation suggestions are enabled and whether applying a remediation is enabled.

The default profile is read-only, local-only, and does not apply changes automatically. Applying a change requires review mode, the apply-remediation capability, and explicit per-change approval.

## Fixed guardrails

The following actions remain blocked: remote/network scanning, exploit validation, credential access or dumping, stealth, persistence, security-control bypass, and executing project code. Users can configure scope and depth of defensive analysis, but cannot switch these guardrails off.

Secret-like values must be redacted before being shown, logged, or exported. Midad should retain source excerpts only when the user explicitly enables that feature in a future UI.

## First knowledge concepts

cyber-knowledge.js starts a bilingual concept catalogue. It models ambiguous terms (for example, Token) as separate concepts and uses context to disambiguate them. When there is insufficient context, it returns an ambiguous result rather than guessing.

The catalogue is a starting point, not a substitute for authoritative security references. Future ingestion should preserve source, version, publication date, and license metadata.

## Current scope and limitations

- No Semgrep binary, vulnerability database, network scanner, or LLM is bundled in this phase.
- The policy API is ready to authorize future local analyzers, but those integrations must be added and tested separately.
- The initial concept set is deliberately small and educational.
- The UI settings panel and persistent user preferences are a subsequent integration task.
- Android remains out of scope until the Windows desktop experience is validated.

## Tests

Run npm test to execute the cyber policy and concept tests alongside the existing Midad test suite.
