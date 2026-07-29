# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
