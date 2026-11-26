# Midad Cyber — Phase 2: Offline AI and Tool Intelligence

## Scope

This phase extends the Windows-first local defensive workspace. It does not alter the Android application or enable active security testing.

## Delivered components

### Offline tool registry

- 209 unique tool names from the researcher-provided inventory.
- 19 subject categories.
- Duplicate and variant normalization for known aliases.
- 28 reviewed high-level summaries with purpose, input/output types, offline boundaries, network considerations, risk notes, limitations, and documentation references.
- Remaining items are marked catalogued-needs-review; unknown properties are intentionally left unspecified.
- Every record has executionEnabled=false. No tool binary is launched, no shell command is executed, and no external target is contacted.

### Local model adapter

- Connects only to http://127.0.0.1:11434.
- Supports local model discovery through /api/tags and local question answering through /api/chat.
- Requires the requested model to already be installed locally.
- No remote URL configuration, cloud fallback, tool calling, or persistent chat history.
- Requests and responses are size-limited and time-limited.
- The system prompt instructs the model to identify incomplete records, distinguish evidence from assumptions, and remain within defensive research explanations.

### Renderer and IPC boundary

- The preload exposes only named operations for tool catalogue search and local model requests.
- IPC handlers validate that requests originate from the trusted local main frame.
- Chromium network requests are denied at the Electron session layer; CSP independently sets connect-src none.
- The main-process model adapter uses a fixed loopback endpoint.

## Offline and security boundary

The application is designed for offline use after dependencies and models have been staged locally. This does not automatically make the Windows machine air-gapped. For stronger isolation, configure Ollama with OLLAMA_NO_CLOUD=1 and OLLAMA_HOST=127.0.0.1:11434, restart it, and apply Windows Firewall and institutional endpoint controls to block outbound connections. Verify the host binding and network policy on the actual workstation.

Model files, tool binaries, rules, and vulnerability databases must be imported through an approved process with provenance and SHA-256 verification. Midad does not download or update these assets.

## Limitations

- The local assistant is an adapter to an installed model; no fine-tuning is claimed or performed in this phase.
- The tool inventory is not a complete review of all 209 tools. Only entries with reviewed summaries are described in detail.
- Tool execution, network scanning, project code execution, exploitation, credential access, and automatic remediation remain disabled.
- Model answers can be wrong. Researchers must verify conclusions against primary documentation and evidence.
- GitHub and CI are development infrastructure, not the offline production deployment channel.
