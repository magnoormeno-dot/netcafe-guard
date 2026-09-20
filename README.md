# netcafe-guard

> Security baselines for leased, multi-tenant, AI-equipped endpoints — starting
> where that future already exists: the internet café.

[![CI](https://github.com/magnoormeno-dot/netcafe-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/magnoormeno-dot/netcafe-guard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/netcafe-guard.svg)](https://www.npmjs.com/package/netcafe-guard)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

<p align="center">
  <img src="docs/assets/demo.svg" width="755" alt="Animated demo: netcafe-guard scans a café PC — 17 checks pass, yet the machine scores 10/100 (F) because session restore is inactive, credentials were left behind, and Recall and clipboard history are on">
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

  Score: 10/100  (F)
  17 pass · 4 fail · 0 unknown · 0 skipped

  FAIL [critical] tenant-session-restore-active     Session restore / write protection is active
        fix: Without this, nothing else on a leased PC can be trusted between users...
  FAIL [critical] tenant-no-leftover-credentials    No leftover credential or AI agent key files
        observed: ["~/.ssh/id_rsa","~/.aws/credentials"]
  FAIL [critical] ai-recall-disabled                Screen recall / AI data analysis capture is disabled
        fix: The next tenant can page back through the previous one's banking session...
  FAIL [high]     ai-clipboard-history-disabled     Clipboard history is disabled
```

## What it does for a venue

- **Answers "is this seat safe for the next person?" in one command** — on the
  machine, in under a second, no agent to install, nothing changed.
- **Finds the AI-era leaks a classical baseline misses** — Recall snapshots,
  clipboard history, a previous tenant's agent keys and MCP configs, a model
  server open to the whole LAN. The demo seat above passes every classical
  check and is still an F.
- **Scales to the floor** — `fleet` turns fifty reports into "this control is
  broken on 92% of seats": one imaging fix, not fifty tickets.
- **Turns findings into a fix you can review** — `--fix-script` writes the
  PowerShell; you read it and run it. Destructive steps stay comments.
- **Catches drift** — `diff` against the post-imaging golden report, from the
  scheduler, with a non-zero exit code the moment something regresses.
- **Gives the owner something they can read** — `--html` is a standalone,
  plain-language report for the person who signs the cheque.

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
netcafe-guard scan --html > report.html  # standalone report to hand to the owner
netcafe-guard scan --profile gaming-cafe # venue profile (or shared-office)
netcafe-guard scan --fail-under 80    # exit non-zero below a score — for CI / scheduled runs
netcafe-guard scan --rules ./cafe.json  # your own ruleset
netcafe-guard list-rules              # what does the baseline check?
netcafe-guard diff before.json after.json  # what drifted between two --json scans (exit 3 on regressions)
netcafe-guard scan --fix-script > fix.ps1  # reviewable remediation script — nothing is executed
netcafe-guard fleet ./reports         # one venue, many seats: what's broken across the floor
```

Run it after imaging a machine, after any config change, and on a schedule
(Task Scheduler → `netcafe-guard scan --fail-under 80`) so drift gets caught.
To see *what* drifted, keep the post-imaging report and diff against it:

```bash
netcafe-guard scan --json > golden.json        # right after imaging
netcafe-guard scan --json > now.json           # later, from the scheduler
netcafe-guard diff golden.json now.json        # regressions, fixes, checks gone unknown
```

### The venue workflow

1. **Image a seat, then scan it** — `scan --json > golden.json`. That is your
   known-good.
2. **Schedule the scan on every seat** — Task Scheduler, once a day, writing
   `--json` to a share.
3. **Read the floor, not the seats** — `fleet ./reports`: what is broken
   everywhere is an imaging problem; what is broken on one seat is that seat.
4. **Fix with your eyes open** — `scan --fix-script > fix.ps1`, review, run.
5. **Prove nothing slid back** — `diff golden.json today.json` in the same
   scheduled job; exit code 3 means a regression.

### A whole venue, not one seat

A café runs dozens of identical-looking machines, and reading fifty reports one
by one is how drift gets missed. Scan each seat to JSON, then aggregate:

```bash
netcafe-guard fleet ./reports --fail-under 70
```

```
  Score  worst 0  ·  median 10  ·  mean 14  ·  best 100
  Grades A:1  F:11

  FAILING ACROSS THE FLEET
    11 seats ( 92%)  [critical] ai-recall-disabled     Screen recall / AI data analysis capture is disabled
     2 seats ( 17%)  [high]     ai-local-llm-not-exposed  Local AI model servers are not exposed to the network
     1 seat  (  8%)  [high]     win-rdp-disabled       Inbound Remote Desktop is disabled
```

A control failing on 92% of seats is an imaging problem; one failing on a single
seat is that seat. The summary separates them, lists the worst seats, keeps
`unknown` in its own section, and exits non-zero when any seat is below
`--fail-under`.

### Fixing what it finds

The scanner never changes the machine — but it will write you the script:

```bash
netcafe-guard scan --fix-script > fix.ps1   # read it, then run it yourself as admin
```

Only checks that **failed** produce commands: `unknown` means "go look", not
"overwrite it". Remediations that delete a tenant's files, install software or
reconfigure a service are deliberately left as comments — a generated script is
the wrong place for `rm -rf` on somebody's profile. Rules carry the machine-
readable part in an optional `fix` field, so a new rule can ship its own
one-line remediation (see [`docs/RULES.md`](docs/RULES.md)).

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
| 2 | **AI surface area** | screen recall capture · leftover Recall snapshot store · Game DVR capture · clipboard history · cross-device clipboard sync · explicit assistant policy · leftover agent tool / MCP configs · local AI model servers exposed to the network |
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

## Venue profiles

The same seat is not the same threat model in every venue. `--profile` keeps
one baseline but skips rules a venue type deliberately handles differently:

- `--profile gaming-cafe` — café seats sit under a management/billing client
  that owns the session lifecycle, so the OS screen-saver lock rules are
  skipped (they are not the control actually in use).
- `--profile shared-office` — the full baseline including idle auto-lock.

Rules opt in via a `profiles` field; untagged rules apply under every profile,
and running without `--profile` always evaluates the full baseline.

## Roadmap

- [x] AI-surface rule for leftover local agent tool / MCP server configs (`ai-no-leftover-agent-configs`)
- [x] Local AI model servers exposed to the network (Ollama, LM Studio, GPT4All, Jan, KoboldCpp, Gradio UIs)
- [ ] MCP servers over SSE/HTTP exposed on shared hosts (needs process-level detection — ports alone are too generic)
- [ ] Café management suite detection (region-specific write-filter agents)
- [ ] Linux and macOS baselines (shared library terminals, Mac kiosks)
- [x] `--profile gaming-cafe` vs `--profile shared-office` rule sets
- [x] HTML report output for handing to a non-technical owner (`--html`)
- [x] Fleet view across many seats (`netcafe-guard fleet`)
- [x] Reviewable remediation script export (`scan --fix-script`)
- [ ] Localised remediation text (zh first)

## Contributing

Especially wanted: **real-world rules from people who actually run these venues**,
and detection for café management suites in your region. Most rule
contributions need zero JavaScript. Start with [CONTRIBUTING.md](CONTRIBUTING.md)
and the [good first issues](https://github.com/magnoormeno-dot/netcafe-guard/labels/good%20first%20issue).

## Enterprise deployment & commercial support

netcafe-guard is free, MIT-licensed, and will stay that way — every check in
this repository will always be runnable by anyone. Some venues want more than a
tool, and that is what we do:

- **Fleet rollout** — scheduled scans on every seat, reports collected
  centrally, a `fleet` summary in your inbox, alerts on regressions.
- **Rules for your management suite** — detection for the write-filter, billing
  and imaging stack your venue actually runs, contributed back upstream where it
  makes sense.
- **Remediation review** — the generated fix scripts, adapted and reviewed by
  someone who has done it on a live floor, so the between-tenant reset is
  provably clean.
- **A baseline you can hand to an auditor** — a written standard for shared,
  AI-equipped seats, with evidence from the scans.

Start with the free tool: run `netcafe-guard fleet` across your seats and send
us the `--json` output. We reply with the three things to fix first.

**Contact: magnoormeno@gmail.com** · full brief in
[docs/ENTERPRISE.md](docs/ENTERPRISE.md)

## License

[MIT](LICENSE) © 2026 shine leek
