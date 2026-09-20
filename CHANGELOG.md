# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Enterprise deployment & commercial support**: README section and a
  one-page brief for decision-makers (`docs/ENTERPRISE.md`) — the problem, what
  the scan finds, the unattended venue loop, what the free tool gives you and
  what is offered on top. Contact line in the HTML report footer and in `help`.
- README: outcome-framed "What it does for a venue" and a five-step venue
  workflow.
- Rules can name an **`evidence`** fact that travels with the finding — the
  file labels behind a count, the service behind a boolean — shown in text,
  HTML and JSON output. Four baseline rules use it (credentials, agent configs,
  exposed model servers, restore agent). The README example now shows real
  output.
- **`examples/jev-triage/`** — routing findings to venue queues with TypeSafe
  AI's Jev decision model (route, urgency, needs-human; low confidence goes to
  human review). Offline-testable: `--dry-run` prints exactly what would be
  sent and sends nothing; the scanner's verdict is never delegated. The core
  package stays zero-dependency.

## [0.1.3] - 2026-09-11

### Added
- **`netcafe-guard fleet <paths...>`** — one venue, many seats. Aggregates any
  number of `scan --json` reports (files or a directory) into what an operator
  actually asks: which control is broken across the floor (with seat counts and
  percentages), which seats are worst, and what came back `unknown`. Re-scans of
  the same host collapse to the newest; non-reports are named, not silently
  counted. `--json` for machines, `--fail-under N` exits 2 when any seat is below
  the threshold.
- **`scan --fix-script`** — prints a PowerShell remediation script for the checks
  that failed. The scanner still never touches the machine: it writes a script a
  human reviews and runs. Only failures are scripted (`unknown` means "go look",
  not "overwrite it"), and destructive remediations — deleting a tenant's files,
  installing software, reconfiguring a service — are deliberately emitted as
  `MANUAL` comments instead of commands.
- Rules gained an optional machine-readable `fix` field (`registry`,
  `registry-delete` or `command` steps, single or array) backing the script
  export, with validator support. 16 of the 21 baseline rules ship one; the other
  five are intentionally manual.
- 15 further tests (84 total).

## [0.1.2] - 2026-09-02

### Added
- **Network exposure of local AI model servers** — new rule
  `ai-local-llm-not-exposed` (high, all platforms): Ollama, LM Studio, GPT4All,
  Jan, KoboldCpp and Gradio-based UIs listening on a non-loopback address.
  On a shared LAN an unauthenticated model server is free compute for anyone
  on the network. Read-only probe over `netstat`/`ss`; generic ports are
  deliberately excluded to avoid false positives.
- **Leftover Recall snapshot store** — new rule `ai-no-recall-snapshot-store`
  (high, win32): existence check on `%LOCALAPPDATA%\CoreAIPlatform.00\UKP`.
  Disabling Recall by policy does not delete what it already captured.
- **`netcafe-guard diff <before.json> <after.json>`** — drift report between
  two `--json` scans: regressions (passed before, failing now), fixes, checks
  that went unknown, rules added/removed. Exit code 3 on regressions, for
  scheduled runs. `--json` for machines.
- Gemini CLI OAuth token path in the credential watchlist (@adity982, #28).
- 21 rules; 69 tests.

## [0.1.1] - 2026-08-18

### Added
- **Game DVR / background screen recording rule** `capture-gamedvr-disabled`
  (high, win32): checks the `AllowGameDVR` policy first, falling back to the
  per-user `AppCaptureEnabled` setting — the same previous-tenant capture
  surface as Recall, without the AI branding, and more common in the field
  today. Contributed by @bm1016bm-svg (#21, closing #4 — the project's third
  external contributor).
- **HTML report** (`scan --html > report.html`): standalone, printable,
  no external assets — made to be handed to a non-technical venue owner.
  All rule-supplied text is escaped, since rulesets can come from third
  parties. (#22)
- **Venue profiles** (`scan --profile gaming-cafe|shared-office`): rules can
  declare a `profiles` field; rules declaring only other profiles are skipped
  (`profile-not-applicable`). The screen-lock rules are tagged
  `shared-office` — café seats sit under a management client that owns the
  session lifecycle. `list-rules` honours `--profile` and shows profile tags.
  (#22)
- **New AI-surface rule** `ai-no-leftover-agent-configs`: leftover agent tool /
  MCP server configs (claude_desktop_config.json, `.cursor/mcp.json`,
  `.codex/config.toml`, `.gemini/settings.json`, …) hand the next tenant a
  preconfigured, pre-approved agent. Existence-only probe, all platforms;
  `claude_desktop_config.json` moved here from the credential watchlist so one
  file doesn't trip two rules. (#22)
- `scan` and `list-rules` warn on stderr when `--profile` names a profile no
  rule declares — typos otherwise silently skip the profile-tagged rules.
  (#23)
- Test suite now at 53 tests (31 at 0.1.0), covering profiles, the HTML
  renderer (including escaping of rule-supplied text), the Game DVR and
  agent-config probes, and the CLI.
- Release workflow skips `npm publish` when the version is already on the
  registry, so creating the GitHub release tag after publishing no longer
  produces a failed run.

## [0.1.0] - 2026-08-03

Initial release.

### Added
- Zero-dependency rule engine with pass / fail / unknown / skip / error states
  and a severity-weighted 0–100 score.
- **Project vision** (`docs/VISION.md`): leased/multi-tenant AI-equipped endpoints
  are the target; the internet café is the wedge because it is the most developed
  form of leased computing that already exists. README leads with this.
- **Multi-tenant hygiene rules** — session restore / write protection detection,
  leftover credential & AI agent key files, browser password saving policy.
- **AI surface rules** — screen recall (`DisableAIDataAnalysis`) capture,
  clipboard history, cross-device clipboard sync, explicit assistant policy.
- Read-only probes for the above, including an existence-only credential probe
  that never reads file contents (watchlist expanded to 17 paths by the
  project's first two external contributors, #13 and #15).
- Read-only Windows probes: auto-logon, stored registry password, Guest account,
  inbound RDP, autorun/AutoPlay, firewall, Defender real-time protection, and
  screen auto-lock (timeout + secure-on-resume).
- Data-driven baseline ruleset (`rules/baseline.json`) — contributors can add a
  check with a few lines of JSON, no code.
- CLI: `scan`, `list-rules`, `version`, `help`; flags `--json`, `--all`,
  `--rules`, `--facts`, `--fail-under`, `--no-color`.
- Rule validator (rejects malformed rules and duplicate ids in CI).
- 31 unit/integration tests via `node --test`, including the key case: a
  machine that passes every classical check while failing every multi-tenant
  and AI-surface check; CI on Node 18/20/22.
- Contributor docs: `CONTRIBUTING.md`, `docs/RULES.md`, issue/PR templates.

### Changed
- Baseline is ordered by priority: multi-tenant hygiene → AI surface →
  classical baseline.
- Package description and keywords reflect the AI-era shared-endpoint scope.
