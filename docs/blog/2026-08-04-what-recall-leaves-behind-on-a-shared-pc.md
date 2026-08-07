# What Recall leaves behind on a shared PC

*2026-08-04 · the reasoning behind netcafe-guard's `ai-recall-disabled` check*

Windows Recall periodically snapshots the screen, extracts the text, and
builds a searchable local timeline of everything that happened on the
machine. On a personal laptop you can argue about whether that trade is
worth it. On a machine that a stranger rents by the hour, there is no
argument to have: **the feature's entire job is to remember the previous
user for the next one.**

## The failure mode, concretely

A gaming café seat turns over every few hours. Walk through what Recall
retains from one session on that seat:

- the previous tenant's banking session, as browsable screenshots
- their messages and logins, OCR'd into searchable text
- whatever document, ticket, or account page they had open
- all of it in a local store in the profile, queryable by whoever sits
  down next with local access

Nothing here requires an exploit. Recall is doing exactly what it was
built to do; the machine is simply the wrong place for it. The threat model
that ships with the feature assumes one long-term owner. A leased seat
breaks that assumption on every turnover.

This is the sharper of the two "AI intrusions" netcafe-guard cares about:
not AI as an attacker's tool, but **the AI you invited in becoming the
exposure.** It is new, largely unmeasured — and, crucially, checkable today.

## How netcafe-guard checks it

The `ai-recall-disabled` rule is `critical`, Windows-only, and read-only —
it reports, it never changes the machine. It looks for the capture feature
being disabled by policy:

```
DisableAIDataAnalysis = 1
  under HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsAI
  (or the HKCU hive)
```

The probe reads that value from HKLM first, then HKCU. If it is `1`, the
check passes. If it is anything else, the rule fails as a critical finding.
If the probe cannot read the key at all, the result is **unknown** — never
silently treated as safe. Unknown means "go verify this by hand," because on
a shared seat an unread capture policy is exactly the thing you cannot
afford to assume.

Remediation is one line, and the report prints it verbatim:

> Set `DisableAIDataAnalysis` to 1 under
> `HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsAI`. Periodic screenshots
> of everything on screen are catastrophic on a shared PC: the next tenant
> can page back through the previous one's banking or login session.

## Recall is not alone on this surface

Recall is the loudest example, but the same "assumes one owner" flaw runs
through the rest of the AI-surface group the scanner checks:

- **Clipboard history** (`AllowClipboardHistory`) carries one tenant's
  copied password straight into the next tenant's session.
- **Cross-device clipboard sync** (`AllowCrossDeviceClipboard`) pushes
  whatever a stranger copied off the device entirely.
- **An explicit assistant policy** — the finding there is the *absence of a
  decision*: an assistant with system reach on a machine used by strangers
  should be allowed or denied on purpose, not inherited from the default.

## Try it

```bash
npx netcafe-guard scan
```

On a real shared Windows seat this one check is often the difference between
a clean pass and a critical finding. If your venue runs a management or
write-filter suite we don't detect yet, or you know an AI-surface setting we
should add, that's exactly the contribution the project wants — start at
[CONTRIBUTING.md](../../CONTRIBUTING.md) and the
[good first issues](https://github.com/magnoormeno-dot/netcafe-guard/labels/good%20first%20issue).
