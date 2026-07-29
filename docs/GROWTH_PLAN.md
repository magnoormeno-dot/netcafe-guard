# The honest growth plan

You wanted the experience of building an open-source project and giving it a
real shot at the kind of adoption Anthropic's "Claude for Open Source" program
rewards. Here is the honest version of how that happens. Read the reality check
first — it's the most important part.

## Reality check

The eligibility bars (≈20 external contributors with merged PRs in a year, or a
library with hundreds of dependents / 200k monthly downloads, or an OpenSSF
criticality score ≥ 0.4) all measure **real strangers choosing to use and
improve your project.** Nobody can manufacture that in 7 days, and nobody
should try — fake stars and sockpuppet PRs are exactly what a human reviewer
screens out, and doing it would get an application rejected.

So this plan is not "hit the bar in a week." It's "do the real launch in a
week, then let it compound over months." A genuinely useful tool in a real
niche (café/venue operators are a real, underserved audience) can absolutely
get there — on the timescale open source actually moves.

## Week 1 — launch (this is the part you do in 7 days)

**Day 1 — Ship it.**
- Publish the repo publicly on GitHub.
- `npm publish` (check the name is free first; if taken, use a scope like
  `@magnoormeno/netcafe-guard`). This makes downloads *possible* — a
  prerequisite for the "downloads" eligibility path.
- Turn on GitHub Issues and Discussions. Add topics: `security`,
  `internet-cafe`, `hardening`, `windows`, `kiosk`.

**Day 2 — Make it real for one user: you.**
- Run it on an actual venue PC (or a Windows VM). File issues for anything it
  got wrong or couldn't read. Dogfooding is what makes the README honest.
- Record a 30-second asciinema/GIF of a scan and put it at the top of the README.
  A visible demo is the single biggest driver of first stars.

**Day 3 — Lower the contribution bar.**
- Open 8–12 `good first issue`s. Concrete, small, mostly JSON:
  "Add a rule for BitLocker status", "Add a rule for USB storage policy",
  "Linux baseline: check for auto-login in LightDM/GDM", "Translate remediation
  text to Chinese". Every one of these is a potential external contributor.
- These issues are your real path to the "20 contributors" bar. Each is a door.

**Day 4 — Tell the people who have this problem.**
- Post where café/venue operators and defensive-security folks actually are:
  r/netsec, r/sysadmin, r/msp, relevant Discord/Telegram operator groups,
  Hacker News (Show HN). Lead with the problem, not the tool.
- Frame: "I run security for gaming venues; here's the free tool I wish existed."
  That's true, specific, and it's you.

**Day 5 — Get listed.**
- Open PRs adding netcafe-guard to relevant `awesome-*` lists
  (awesome-security, awesome-windows-hardening, awesome-selfhosted-adjacent).
  Being discoverable is half the battle.

**Day 6 — Respond.**
- Answer every issue and comment within a day. Merge the first outside PR fast
  and thank the person publicly. Early responsiveness is what turns a drive-by
  visitor into a repeat contributor.

**Day 7 — Reflect and write it down.**
- Write a short `CHANGELOG` entry and a "what's next" note. Post a one-week
  update. Momentum is a story you tell.

## Beyond week 1 — the part that actually clears the bar

- **Ship a new rule or fix every week.** A repo with recent, regular commits
  reads as alive. That alone puts you ahead of most projects.
- **Turn issues into contributor onboarding.** When someone files "you should
  check X," reply "great idea — here's how to add that rule, want to PR it?"
  That single sentence is how a project grows contributors instead of just
  users.
- **Expand the surface.** Linux/macOS baselines and localised remediation each
  open a new audience and a new set of potential contributors.
- **Re-apply when you have a real story.** Once the repo has genuine traction —
  real contributors, real downloads, real issues from real operators — the
  "Ecosystem Impact Track" lets you apply with a written case even if you're
  below the headline numbers. At that point you won't be gaming anything;
  you'll just be telling the truth about a project people depend on.

## Optional: watch the real numbers grow

Once the repo is public you can have me set up a scheduled check-in that reads
the *real* GitHub stats (stars, contributors, open PRs) and reports them back
each morning — an honest progress loop, not a fake one. Just ask.

The wish was never really the free subscription. It was to make something and
watch strangers care about it. That part is entirely real, and it starts the
day you hit publish.
