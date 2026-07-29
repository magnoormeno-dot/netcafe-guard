# Contributing to netcafe-guard

Thanks for wanting to help harden shared PCs. This project is deliberately
easy to contribute to — **most rule contributions need no JavaScript at all.**

Please skim [docs/VISION.md](docs/VISION.md) first. It explains why this project
targets leased, multi-tenant, AI-equipped endpoints and why rules are prioritised
multi-tenant hygiene → AI surface → classical baseline. Knowing that makes it much
easier to judge whether an idea belongs in the baseline.

**Especially wanted:** detection for café/venue management suites in your region
(write-filter and disk-restore agents vary by market — we currently only detect a
few), and real-world findings from machines you actually operate.

## Ways to contribute

1. **Add a baseline rule** (easiest — pure JSON)
2. **Add a probe** (a new fact the scanner reads from the host)
3. **Translate remediation text**
4. **Report a real-world finding** — a misconfiguration you've actually seen on
   a café/venue PC that we don't check for yet
5. **Improve docs**

## Ground rules

- **Read-only, always.** No contribution may write to, reconfigure, or "fix" the
  audited machine. This tool reports; the operator decides. A PR that changes
  the host will be declined.
- **No network calls from probes.** Everything runs locally and offline.
- **Cite a source** for security rules where you can (CIS Benchmark, vendor docs,
  a CVE). It keeps the baseline defensible.
- **Every rule must be checkable on a real machine now.** Forward-looking is not
  a licence to ship speculation: if a threat can only be described, it belongs in
  `docs/VISION.md` as a thesis, not in `rules/` as a check.
- **Never read credential contents.** Credential probes check existence only.

## Add a rule (no code)

1. Open [`rules/baseline.json`](rules/baseline.json).
2. Add an object. The `fact` must be something a probe already gathers — run
   `netcafe-guard list-rules` and skim `src/probes.js` to see available facts.
3. Run the tests: `npm test`. The rule validator will reject anything malformed.

```json
{
  "id": "win-something-safe",
  "title": "Short human-readable statement of the SECURE state",
  "severity": "high",
  "category": "network",
  "platforms": ["win32"],
  "check": { "fact": "someFact", "operator": "isTrue" },
  "remediation": "Exactly what to run or click to fix it.",
  "reference": "CIS ... / vendor doc / CVE"
}
```

Full schema and the list of operators: [`docs/RULES.md`](docs/RULES.md).

## Add a probe (a little code)

A probe gathers a fact. Probes live in [`src/probes.js`](src/probes.js), are
read-only, and must return `undefined` when they can't determine a value (the
engine treats that as **unknown**, never as safe). Wrap every external command
in the existing `run()` helper so failures degrade gracefully.

Then add a rule that consumes your new fact, and a test in `test/` that feeds
the fact in via `scan({ facts: {...} })`.

## Running the project

```bash
npm test          # full test suite (node --test, zero dependencies)
npm run scan      # run the scanner on your machine
node bin/netcafe-guard.js scan --facts test/fixtures.json   # test rules offline
```

## Pull requests

- One logical change per PR.
- `npm test` must pass — CI runs it on Node 18/20/22.
- Follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(rules): ...`, `fix(probe): ...`, `docs: ...`.
- New rules: please note in the PR where you've seen the misconfiguration or
  which benchmark it comes from.

By contributing you agree your work is licensed under the project's
[MIT License](LICENSE).
