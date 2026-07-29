---
name: New rule request
about: Suggest a security check for shared/public PCs
title: "rule: <short description of the secure state>"
labels: ["rule", "good first issue"]
---

**What should be checked?**
Describe the secure configuration (e.g. "BitLocker should be enabled on the system drive").

**Why does it matter for a shared/public PC?**
What can a walk-up user or attacker do if this is misconfigured?

**How would the scanner read it?** (if you know)
Registry key, command, PowerShell cmdlet, file path — anything read-only.

**Reference** (optional)
CIS Benchmark item, vendor doc, CVE.

---
_Most rules are a ~5-line JSON edit — see [docs/RULES.md](../../docs/RULES.md).
Happy to guide you through your first PR._
