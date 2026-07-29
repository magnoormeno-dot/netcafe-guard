# netcafe-guard

> Security baseline auditor for shared and public PCs — internet cafés, gaming venues, libraries, and kiosks.

[![CI](https://github.com/magnoormeno-dot/netcafe-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/magnoormeno-dot/netcafe-guard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/netcafe-guard.svg)](https://www.npmjs.com/package/netcafe-guard)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

A public PC is a hostile environment: dozens of strangers a day, USB sticks in every port, and one shared Windows image that nobody re-checks after the initial setup. `netcafe-guard` reads that machine's configuration against a hardening baseline and tells you, in plain language, what a walk-up attacker could abuse — auto-logon, a live Guest account, autorun on USB drives, an open RDP port, a firewall someone switched off "just to test something" six months ago.

It is **read-only by design.** The tool never changes the machine it audits — it reports, you decide.

```
  netcafe-guard  security baseline scan
  host: CAFE-PC-07  ·  platform: win32/x64

  Score: 0/100  (F)
  1 pass · 9 fail · 0 unknown · 0 skipped

  FAIL [critical] win-no-stored-password  No cleartext logon password stored in the registry
        fix: Delete the DefaultPassword value under Winlogon...
  FAIL [high] win-autologon-disabled     Automatic logon is disabled
        fix: Set AutoAdminLogon to 0. Auto-logon hands every walk-up user an authenticated desktop.
  FAIL [high] win-autorun-disabled       Autorun/AutoPlay is disabled on all drive types
        fix: Set NoDriveTypeAutoRun to 0xFF. USB autorun is a classic infection vector.
  ...
```

## Why

CIS Benchmarks and enterprise EDR exist, but they are built for corporate fleets with a domain, a sysadmin, and a budget. The person running a 20-seat gaming café has none of those. `netcafe-guard` is a single command, no install ceremony, no agent, no account — pointed squarely at the handful of misconfigurations that actually get shared PCs owned.

## Install

Requires Node.js 18+.

```bash
# one-off, no install
npx netcafe-guard scan

# or install globally
npm install -g netcafe-guard
netcafe-guard scan
```

## Usage

```bash
netcafe-guard scan                    # audit this machine, show problems
netcafe-guard scan --all              # show every check, including passes
netcafe-guard scan --json > out.json  # machine-readable, for dashboards
netcafe-guard scan --fail-under 80    # exit non-zero below a score — good for CI / scheduled runs
netcafe-guard scan --rules ./cafe.json  # your own ruleset
netcafe-guard list-rules              # what does the baseline check?
```

Run it after imaging a new machine, after any config change, and on a schedule (Task Scheduler → `netcafe-guard scan --fail-under 80`) so drift gets caught.

### Scores

The score starts at 100 and loses points for each failed check, weighted by severity (critical −25, high −15, medium −8, low −3). It is a **triage aid, not a compliance certificate** — a 100 means "no baseline failures the scanner could see," not "unhackable." Anything the scanner cannot read is reported as **unknown**, never assumed safe.

## What it checks (baseline v0.1)

The starter baseline focuses on Windows, where almost all café/venue PCs live:

| Category | Checks |
| --- | --- |
| Authentication | auto-logon disabled · no cleartext password in registry |
| Accounts | Guest account disabled |
| Remote access | inbound RDP disabled |
| Removable media | autorun/AutoPlay disabled on all drives |
| Network | firewall on for all profiles |
| Malware | Defender real-time protection on |
| Session | screen auto-lock enabled, ≤15 min, secured on resume |

See [`docs/RULES.md`](docs/RULES.md) for the full list and the rule schema.

## Bring your own rules

Rules are plain JSON — no code required. A rule maps a fact the scanner gathers to a secure expectation:

```json
{
  "id": "win-guest-disabled",
  "title": "Built-in Guest account is disabled",
  "severity": "medium",
  "category": "accounts",
  "platforms": ["win32"],
  "check": { "fact": "guestAccountActive", "operator": "isFalse" },
  "remediation": "Run: net user guest /active:no"
}
```

Adding a check for your venue's own policy is a five-line JSON edit. That is deliberate — see [CONTRIBUTING.md](CONTRIBUTING.md). New probes (facts the scanner reads from the host) live in `src/probes.js` and are always read-only.

## Roadmap

- [ ] Linux and macOS baselines (shared library terminals, Mac kiosks)
- [ ] A curated `--profile gaming-cafe` vs `--profile library` rule set
- [ ] HTML report output for handing to a non-technical owner
- [ ] Localised remediation text (zh / other languages common in café markets)

Contributions in any of these directions are very welcome — especially real-world rules from people who actually run these venues.

## Contributing

New rules, new probes, translations, bug reports from real deployments — all welcome, and most rule contributions need zero JavaScript. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [good first issues](https://github.com/magnoormeno-dot/netcafe-guard/labels/good%20first%20issue).

## License

[MIT](LICENSE) © 2026 shine leek
