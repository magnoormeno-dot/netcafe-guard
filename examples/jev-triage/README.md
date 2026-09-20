# Routing findings with a decision model (Jev)

netcafe-guard decides **what is wrong** — deterministically, offline, from rules
you can read. This example shows how a venue's automation can decide **what
happens next** with [Jev](https://typesafe.ai/), TypeSafe AI's "System One"
decision model: given a seat's findings, it returns typed answers with
calibrated confidence — which queue the seat goes to, how urgent it is, and
whether a person should look first — instead of generating text.

That boundary is deliberate. The scanner stays zero-dependency and never asks a
model whether a machine is safe. The model only routes the result.

## What it does

For every `scan --json` report:

| Question | Type | Answer |
| --- | --- | --- |
| Where should this seat's findings go? | `choice` | `reimage` · `remote_fix` · `technician_visit` · `owner_decision` · `no_action`, with a confidence and a probability per option |
| How urgently must it be handled? | `score` 0–3 | 0 nothing · 1 this week · 2 today · 3 take the seat out of service |
| Should a person review this first? | `noul` (yes/no) | probability of *yes* |

Then thresholds turn that into a queue: route confidence below `--min-confidence`
(default 0.7) **or** "needs human" at or above `--human-threshold` (default 0.5)
lands the seat in `human_review`. The model's uncertainty is a signal, not noise
to round away.

Nothing is executed. The output is a decision per seat, as text or `--json`, for
your ticketing or MDM to act on.

## Run it

```bash
cd examples/jev-triage
npm install                      # @typesafe-ai/sdk (MIT), Node 20+
export TYPESAFE_API_KEY=...      # from typesafe.ai

node triage.js ../../reports/            # a directory of scan --json files
node triage.js seat-07.json --json       # one seat, machine-readable
node triage.js ../../reports/ --dry-run  # print exactly what would be sent, send nothing
```

Run `--dry-run` first. It prints the full payload — the per-seat `state` and
the questions — and contacts nothing.

## What leaves the machine

Only the summary that `buildState()` builds from the report: hostname, platform,
profile, score, grade, and for each failing check its id, severity, title,
remediation text, the observed value and the **evidence labels** the report
already carries (for example `~/.ssh/id_rsa`). netcafe-guard never reads file contents, so there are
none to send. Still: this is a third-party API. Check TypeSafe's data-retention
terms and your venue's policy before pointing it at real reports.

## Jev facts this example relies on

Taken from the official SDK source on 2026-09-20 — verify against
[docs.typesafe.ai](https://docs.typesafe.ai/) before relying on them:

- Package `@typesafe-ai/sdk` (MIT, Node ≥ 20); auth via `TYPESAFE_API_KEY`;
  endpoint `POST https://api.typesafe.ai/v1/systemone`; default model `jev-latest`.
- `client.systemOne({ state, questions })` returns `{ answers, model, usage }`.
- `choice(...)` answers carry `choice`, `confidence`, `probabilities`;
  `score(...)` answers carry `score`, `confidence`, `legend`, `probabilities`;
  `noul(...)` answers carry `noul`, the probability of *yes*.
- Pricing and latency as stated by TypeSafe at launch (September 2026): output
  is free, input is metered; Jev was in early access at the time of writing.
- Known limitations are documented by TypeSafe at
  `docs.typesafe.ai/model-jaggedness/<version>` — read that page before choosing
  thresholds. We could not reach it from the environment this example was
  written in, so nothing here summarises it.

Source: <https://github.com/typesafe-ai/typesafe-sdk-js>

## Adapting it

- Change `ROUTES` to the queues your venue actually has. The descriptions are
  what the model reads; write them the way you would brief a new technician.
- Raise `--min-confidence` if human review is cheap for you; lower it if the
  routes are coarse and the cost of a wrong queue is low.
- The scanner's own verdict (`score`, `--fail-under`, `diff` exit codes) stays
  the gate for anything that takes a seat out of service. Do not replace it
  with a probability.
