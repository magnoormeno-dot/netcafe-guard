# netcafe-guard

> Security baselines for leased, multi-tenant, AI-equipped endpoints — starting
> where that future already exists: the internet café.

[![CI](https://github.com/magnoormeno-dot/netcafe-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/magnoormeno-dot/netcafe-guard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/netcafe-guard.svg)](https://www.npmjs.com/package/netcafe-guard)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

<p align="center">
  <img src="docs/assets/demo.svg" width="755" alt="Animated demo: netcafe-guard scans a café PC — 13 classical checks pass, yet the machine scores 10/100 (F) because session restore is inactive, credentials were left behind, and Recall and clipboard history are on">
</p>
<p align="center"><sub>A classically-clean seat that is still an F where it matters. Replay it from a clone:<br>
<code>node bin/netcafe-guard.js scan --facts demo/cafe-pc-07.json --platform win32</code></sub></p>

## Why this exists

Rising hardware cost — driven hard by AI — is pushing computing from *ownership*
toward *leasing*. The internet café is the most developed form of leased
computing that already exists: thousands of venues handing a machine to a
stranger every few hours. Today it serves gamers. The moment leased computing has
to serve **work**, it has to serve **AI**, because AI assistants and agents are
becoming the interface to the work rather than an add-on to it.

That makes one question decisive for any venue or enterprise running shared
seats: **what does the AI on a machine a stranger used an hour ago actually
expose?**

Meanwhile the operators already running leased computing at scale have almost no
security tooling — no baseline, no drift detection, no way to answer "is this
machine safe for the next person."

`netcafe-guard` closes that gap now, in order to be ready for what's coming. The
full argument is in **[docs/VISION.md](docs/VISION.md)** — read that first if you
want to know where this project is going.

### Two kinds of "AI intrusion"

Conflating these is why the problem gets hand-waved:

- **AI as the attacker's instrument** — cheap, adaptive, automated attacks. This
  is a reason to have a baseline at all.
- **The AI you invited in is the exposure** — an assistant or agent legitimately
  wants to read your files, watch your screen, hold API credentials, and execute
  tools. On a leased machine every one of those is a multi-tenant leak. This one
  is new, mostly unmeasured, and **checkable today**.

The second is what this scanner measures.

## What it does

Reads a machine's configuration against a hardening baseline and reports, in
plain language, what the next tenant — or a walk-up attacker — could abuse.

**It is read-only by design.** It never changes the machine it audits. A scanner
that reconfigured leased machines would itself become the multi-tenant risk.

```
  netcafe-guard  security baseline scan
  host: CAFE-PC-07  ·  platform: win32/x64

  Score: 0/100  (F)
  FAIL [critical] tenant-session-restore-active     Session restore / write protection is active
        fix: Without this, nothing else on a leased PC can be trusted between users...
  FAIL [critical] ai-recall-disabled                Screen recall / AI data analysis capture is disabled
        fix: The next tenant can page back through the previous one's banking session...
  FAIL [critical] tenant-no-leftover-credentials    No leftover credential or AI agent key files
        observed: ["~/.ssh/id_rsa","~/.aws/credentials"]
  FAIL [high]     ai-clipboard-history-disabled     Clipboard history is disabled
  ...
```

## Install

Requires Node.js 18+.

```bash
npx netcafe-guard scan          # one-off, no install
npm install -g netcafe-guard    # or install globally
```

## Usage

```bash
netcafe-guard scan                    # audit this machine, show problems
netcafe-guard scan --all              # show every check, including passes
netcafe-guard scan --json > out.json  # machine-readable, for dashboards
netcafe-guard scan --fail-under 80    # exit non-zero below a score — for CI / scheduled runs
netcafe-guard scan --rules ./cafe.json  # your own ruleset
netcafe-guard list-rules              # what does the baseline check?
```

Run it after imaging a machine, after any config change, and on a schedule
(Task Scheduler → `netcafe-guard scan --fail-under 80`) so drift gets caught.

### Scores

Starts at 100, loses points per failed check weighted by severity (critical −25,
high −15, medium −8, low −3). It is a **triage aid, not a compliance
certificate.** Anything the scanner cannot read is reported as **unknown** —
never assumed safe.

## The baseline

Rules are grouped by the priority order argued in the vision doc:

| Priority | Category | Checks |
| --- | --- | --- |
| 1 | **Multi-tenant hygiene** | session restore / write protection · leftover credential & AI agent key files · browser password saving |
| 2 | **AI surface area** | screen recall capture · clipboard history · cross-device clipboard sync · explicit assistant policy |
| 3 | **Classical baseline** | auto-logon · cleartext registry password · Guest account · inbound RDP · autorun · firewall · Defender real-time · screen auto-lock |

Priority 3 is unglamorous and still failing in the field, which is why it ships
and stays. Priority 1 comes first because without it the previous tenant can
undo every other control on the list.

Full list and schema: [`docs/RULES.md`](docs/RULES.md).

## Scope discipline

Being forward-looking is not a licence to ship speculation:

- **Every rule must be checkable on a real machine now.** If a threat can only be
  described, it lives in [docs/VISION.md](docs/VISION.md) as a thesis — not in
  `rules/` as a check.
- **Read-only, always.**

## Bring your own rules

Rules are plain JSON — no code required:

```json
{
  "id": "ai-recall-disabled",
  "title": "Screen recall / AI data analysis capture is disabled",
  "severity": "critical",
  "category": "ai-surface",
  "platforms": ["win32"],
  "check": { "fact": "recallDisabled", "operator": "isTrue" },
  "remediation": "Set DisableAIDataAnalysis to 1 under ...WindowsAI"
}
```

## Roadmap

- [ ] More AI-surface rules: local agent tool configs, MCP server exposure on shared hosts
- [ ] Café management suite detection (region-specific write-filter agents)
- [ ] Linux and macOS baselines (shared library terminals, Mac kiosks)
- [ ] `--profile gaming-cafe` vs `--profile shared-office` rule sets
- [ ] HTML report output for handing to a non-technical owner
- [ ] Localised remediation text (zh first)

## Contributing

Especially wanted: **real-world rules from people who actually run these venues**,
and detection for café management suites in your region. Most rule
contributions need zero JavaScript. Start with [CONTRIBUTING.md](CONTRIBUTING.md)
and the [good first issues](https://github.com/magnoormeno-dot/netcafe-guard/labels/good%20first%20issue).

## License

[MIT](LICENSE) © 2026 shine leek
