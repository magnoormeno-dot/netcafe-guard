# Two strangers in four days: what a good-first-issue can actually do

*2026-08-18 · how netcafe-guard got its first three contributors with zero
stars and zero promotion*

This project went public on July 29 with no audience: no launch post, no
social thread, literally zero stars. Four days later, two strangers had
found it, written code, and had it merged. By day fifteen a third had
shipped a whole new probe. Every one of them arrived through the same door:
a **good-first-issue**.

Since the numbers are unglamorous and public, let's use them. This is what
worked, verifiable from the timeline, for anyone else maintaining a small
project nobody has heard of yet.

## The timeline

- **Jul 29, 22:05 UTC** — repository goes public. An hour later, twelve
  good-first-issues go up, covering real checks the scanner was missing.
- **Jul 31, 07:48** — [PR #13](https://github.com/magnoormeno-dot/netcafe-guard/pull/13)
  arrives from @tomatotomata, the first stranger: two verified paths for the
  leftover-credential watchlist, from
  [#5](https://github.com/magnoormeno-dot/netcafe-guard/issues/5). That is
  ~33 hours after the issues were posted. **Merged in about a day.**
- **Aug 2, 07:04** — [PR #15](https://github.com/magnoormeno-dot/netcafe-guard/pull/15)
  from @jawad7ali: cloud/dev CLI credential paths (Azure, gcloud, kube,
  Docker, Terraform), from
  [#6](https://github.com/magnoormeno-dot/netcafe-guard/issues/6).
  **Merged the same day, ten hours after it was opened.**
- **Aug 3** — v0.1.0 ships to npm with both contributions in it, credited by
  name in the changelog and release notes.
- **Aug 11–13** — [PR #21](https://github.com/magnoormeno-dot/netcafe-guard/pull/21)
  from @bm1016bm-svg implements a full new probe (Game DVR background
  recording) from [#4](https://github.com/magnoormeno-dot/netcafe-guard/issues/4),
  and ships in v0.1.1 five days later.

Three for three came through good-first-issues. Nobody came through
anything else — because there *was* nothing else running.

## Anatomy of the issue that worked

Comparing the issues that got claimed against generic "help wanted" advice,
five properties did the work:

1. **The issue is the spec.** Exact file, exact array or function to edit,
   suggested fact name, suggested rule id and severity. The contributor's
   first decision is *how*, never *what* or *where*.
2. **The lowest rung is "edit a list."** The watchlist issues (#5, #6) need
   zero JavaScript: add a path, cite how you verified it. Both first-time
   contributors entered there. The third took a bigger issue — a real probe —
   and the ladder from list-edit to probe is visible in the issue queue.
3. **No special hardware to contribute.** The scanner targets Windows
   machines, but `scan --facts your-facts.json --platform win32` evaluates
   injected facts anywhere. Every issue says so. Nobody has to own the
   environment they're hardening.
4. **Fast, substantive review.** First response and merge inside a day for
   both early PRs (ten hours for #15). The one time review took two days
   (#21), the review opened with an apology and the verification we'd
   actually run. Speed is a signal contributors read; so is honesty when
   you miss it.
5. **Shipped means credited.** Both early contributors got a "your code is
   on npm" comment with the version number within a day of the release, and
   names in the changelog. The third contributor's rule shipped credited in
   0.1.1 the same week it merged.

## The honest caveats

- **We still don't know the discovery channel.** Aggregators that index the
  `good first issue` label? GitHub search? npm? We've asked all three
  contributors publicly and will report what they say. Deciding where to
  invest next depends on an answer we don't have yet — pretending otherwise
  would be making it up.
- **This funnel produced contributors, not users.** Zero stars while three
  strangers shipped code is a strange shape for a project to have. Issues
  written as specs attract people who want to build; they do nothing for
  people who need the tool but will never open the issue tab. That half of
  the work — distribution — is separate, and for this project it hasn't
  started yet.

## If you're trying to replicate this

Write the issue you wish you'd been handed on your first open-source PR:
one file, one change, acceptance criteria, a way to develop without special
hardware, and a maintainer who answers within a day and says "your code
shipped in vX.Y.Z" when it does. Then keep at least ten of those open, and
label them honestly — the label, it turns out, is a distribution channel.

*The scanner this project builds:*
[README](../../README.md) ·
[good first issues](https://github.com/magnoormeno-dot/netcafe-guard/labels/good%20first%20issue) ·
`npx netcafe-guard scan`
