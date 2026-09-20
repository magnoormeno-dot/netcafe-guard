# netcafe-guard for venues and enterprises

*A one-page brief for the person who owns the machines, not the person who
runs the scanner.*

## The problem, in one paragraph

Every machine you hand to a stranger — a café seat, a kiosk, a shared-office
desk, a training-room PC — is used by someone else an hour later. Every AI
feature shipping on those machines assumes one long-term owner: Windows Recall
screenshots the screen and keeps it; clipboard history keeps what was copied;
a Cursor or Claude config left behind is a pre-approved agent for the next
person; an Ollama server bound to `0.0.0.0` is free compute for the whole LAN.
None of that is a bug. It is all working as designed, on the wrong kind of
machine. Classical hardening checklists do not look for any of it.

## What netcafe-guard does

A read-only baseline scan — 21 checks in three priority groups — that says, in
plain language, what the next tenant or a walk-up attacker could abuse:

1. **Multi-tenant hygiene** — is a restore / write-filter agent actually active;
   are there leftover SSH keys, cloud credentials, AI agent tokens.
2. **AI surface area** — Recall (policy *and* the leftover snapshot store),
   Game DVR, clipboard history and sync, assistant policy, leftover agent/MCP
   configs, local model servers exposed to the network.
3. **Classical baseline** — auto-logon, cleartext passwords, Guest, RDP,
   autorun, firewall, Defender, screen lock. Unglamorous, still failing in the
   field.

**It never changes the machine.** A scanner that reconfigured leased machines
would itself be the multi-tenant risk. Anything it cannot read is reported as
*unknown* — never assumed safe.

## What it looks like on a floor

```
  netcafe-guard  fleet summary
  seats: 12

  Score  worst 0  ·  median 10  ·  mean 14  ·  best 100
  Grades A:1  F:11

  FAILING ACROSS THE FLEET
    11 seats ( 92%)  [critical] tenant-session-restore-active   Session restore / write protection is active
    11 seats ( 92%)  [critical] ai-recall-disabled              Screen recall / AI data analysis capture is disabled
    11 seats ( 92%)  [high]     ai-clipboard-history-disabled   Clipboard history is disabled
     2 seats ( 17%)  [high]     ai-local-llm-not-exposed        Local AI model servers are not exposed to the network
     1 seat  (  8%)  [high]     win-rdp-disabled                Inbound Remote Desktop is disabled

  COULD NOT BE READ (unknown ≠ safe)
     1 seat  (  8%)  [high]     win-defender-realtime
```

Read that as an operator: three controls are broken on 92% of seats — that is
the image, fix it once. Two seats have a model server open to the LAN — that is
two conversations. One seat could not report on Defender — go look at it.

The loop that produces this runs unattended:

| Step | Command | Who reads it |
| --- | --- | --- |
| Known-good after imaging | `scan --json > golden.json` | nobody, it's the reference |
| Daily, every seat | `scan --json > \\share\reports\%COMPUTERNAME%.json` | the scheduler |
| The floor | `fleet \\share\reports --fail-under 70` | the technician |
| The fix | `scan --fix-script > fix.ps1` | the technician, before running it |
| Drift | `diff golden.json today.json` | the scheduler; exit 3 pages someone |
| The owner | `scan --html > report.html` | you |

## What the free tool gives you

Everything above. Zero dependencies, one command (`npx netcafe-guard scan`),
provenance-signed releases on npm, a public test suite, and a ruleset you can
read and extend in JSON without writing code. Four external contributors have
added checks so far; the project is young and says so.

## What we offer on top

The tool is free and stays free. The work around it is what we sell:

- **Fleet rollout** — scheduled scans on every seat, reports collected
  centrally, a fleet summary delivered to you, alerts on regressions.
- **Rules for your stack** — detection for the write-filter, billing and
  imaging suite your venue actually runs. Upstreamed when it is general,
  private when it is yours.
- **Remediation review** — the generated fix scripts, adapted to your image
  and reviewed by someone who has done it on a live floor, so the
  between-tenant reset is provably clean.
- **A written baseline** — a standard for shared, AI-equipped seats you can
  hand to a landlord, an insurer or an auditor, with scan evidence behind it.
- **Training** — half a day with your technicians: what the checks mean, how
  to read a fleet report, how to keep the image clean.
- **Automating what happens next** — a hundred seats produce a hundred reports
  a day. We wire them into your ticketing or MDM, including deploying a
  decision model (TypeSafe AI's Jev) that routes each seat to the right queue —
  re-image, remote fix, technician visit, owner decision — with a confidence
  score, so only the genuinely ambiguous cases reach a person. The scanner's
  verdict stays deterministic; the model only decides who handles it. A
  working example ships in the repository (`examples/jev-triage/`).

## How an engagement starts

Run the free tool. Send the output. We tell you the three things to fix first.

```bash
npx netcafe-guard scan --json > seat.json     # one seat is enough to start
```

**Contact: magnoormeno@gmail.com**

---

*Read-only by design. MIT-licensed. Source, tests and every rule:
https://github.com/magnoormeno-dot/netcafe-guard*
