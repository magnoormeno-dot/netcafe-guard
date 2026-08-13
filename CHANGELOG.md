# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **HTML report** (`scan --html > report.html`): standalone, printable,
  no external assets — made to be handed to a non-technical venue owner.
- **Venue profiles** (`scan --profile gaming-cafe|shared-office`): rules can
  declare a `profiles` field; rules declaring only other profiles are skipped
  (`profile-not-applicable`). The screen-lock rules are tagged
  `shared-office` — café seats sit under a management client that owns the
  session lifecycle. `list-rules` honours `--profile` and shows profile tags.
- **New AI-surface rule** `ai-no-leftover-agent-configs`: leftover agent tool /
  MCP server configs (claude_desktop_config.json, `.cursor/mcp.json`,
  `.codex/config.toml`, `.gemini/settings.json`, …) hand the next tenant a
  preconfigured, pre-approved agent. Existence-only probe, all platforms;
  `claude_desktop_config.json` moved here from the credential watchlist.
- 16 further tests (47 total) covering profiles, the HTML renderer (including
  escaping of rule-supplied text) and the agent-config probe.
- **Project vision** (`docs/VISION.md`): leased/multi-tenant AI-equipped endpoints
  are the target; the internet café is the wedge because it is the most developed
  form of leased computing that already exists. README now leads with this.
- **Multi-tenant hygiene rules** — session restore / write protection detection,
  leftover credential & AI agent key files, browser password saving policy.
- **AI surface rules** — screen recall (`DisableAIDataAnalysis`) capture,
  clipboard history, cross-device clipboard sync, explicit assistant policy.
- Read-only probes for the above, including an existence-only credential probe
  that never reads file contents.
- 5 further tests (31 total) including the key case: a machine that passes every
  classical check while failing every multi-tenant and AI-surface check.

### Changed
- Baseline is now ordered by priority: multi-tenant hygiene → AI surface →
  classical baseline.
- Package description and keywords reflect the AI-era shared-endpoint scope.

## [0.1.0]

Initial release.

### Added
- Zero-dependency rule engine with pass / fail / unknown / skip / error states
  and a severity-weighted 0–100 score.
- Read-only Windows probes: auto-logon, stored registry password, Guest account,
  inbound RDP, autorun/AutoPlay, firewall, Defender real-time protection, and
  screen auto-lock (timeout + secure-on-resume).
- Data-driven baseline ruleset (`rules/baseline.json`) — contributors can add a
  check with a few lines of JSON, no code.
- CLI: `scan`, `list-rules`, `version`, `help`; flags `--json`, `--all`,
  `--rules`, `--facts`, `--fail-under`, `--no-color`.
- Rule validator (rejects malformed rules and duplicate ids in CI).
- 26 unit/integration tests via `node --test`; CI on Node 18/20/22.
- Contributor docs: `CONTRIBUTING.md`, `docs/RULES.md`, issue/PR templates.
