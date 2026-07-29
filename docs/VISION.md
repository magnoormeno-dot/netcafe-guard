# Vision: security baselines for leased, multi-tenant, AI-equipped endpoints

This project starts at the internet café. The café is not the point — it is the
most mature, most observable instance of a shift that is still early.

## The thesis

**1. Hardware cost is pushing computing from ownership toward leasing.**
As the cost of a capable machine rises — driven hard by the compute demands of
AI — the assumption that every user buys and owns their PC weakens. Access
starts to look more like a rental than a purchase.

**2. The internet café is the most developed form of leased computing that
already exists.** Not a thought experiment: thousands of venues, millions of
users, a machine handed to a stranger every few hours. Whatever problems leased
computing has, cafés have them first and at scale.

**3. Today that market serves gamers. Next it serves work.** Leased seats used
purely for entertainment are a narrow market. The moment leased computing has to
serve office and professional users, the requirements change completely — because
the work itself has changed.

**4. Serving work now means serving AI.** You cannot offer a modern work
environment without AI assistants and AI agents on the endpoint. They are
becoming the primary interface to the work, not an add-on to it.

**5. Therefore the defining security question becomes: how does a venue — or an
enterprise — avoid being penetrated *through* AI?** Not "should we allow AI," but
"what does AI on a machine that a stranger used an hour ago actually expose?"

**6. Meanwhile, shared-PC security management is primitive.** The venues that
already run leased computing at scale mostly have no baseline, no drift
detection, and no way to answer "is this machine safe for the next person." That
gap is the opening.

`netcafe-guard` is built for step 6 in order to be ready for step 5.

## Two kinds of "AI intrusion"

Conflating these is why the problem gets hand-waved. They need different
defenses:

**(a) AI as the attacker's instrument.** Automated, cheap, adaptive attacks
against the venue — credential stuffing, social engineering at scale, malware
that rewrites itself. This raises the cost of *being* unhardened. It is mostly a
reason to have a baseline at all.

**(b) The AI you invited in is the exposure.** This is the new, specific, and
currently unmeasured one. An AI assistant or agent on the endpoint legitimately
wants broad reach: read the filesystem, watch the screen, hold API credentials,
execute tools, remember context. Every one of those capabilities is a
multi-tenant leak the moment the machine is leased:

- **Screen capture and recall features** photograph the previous tenant's
  banking session, and the next tenant can page back through it.
- **Clipboard history and cross-device sync** carry one user's password into the
  next user's session.
- **Leftover agent credentials** — an API key, an MCP server config, an SSH
  key — left in a home directory become a free identity for whoever sits down
  next, and one that bills someone else.
- **Agent tool access** on a shared box means untrusted user A can configure a
  tool surface that runs for untrusted user B.

Category (b) is checkable *today*, on real machines, with a read-only baseline
scanner. That is what this tool does, and it is why the roadmap points at AI
surface area rather than at more traditional antivirus checks.

## What this implies for the roadmap

The baseline grows along two axes, in this order of priority:

1. **Multi-tenant hygiene** — does anything at all guarantee this machine is
   clean for the next person? Session restore / write protection, profile
   persistence, leftover credentials, saved browser passwords. This is the
   foundation: without it, no AI control matters.
2. **AI surface area** — what does the AI on this endpoint see, keep, and hold?
   Screen capture/recall, clipboard retention, assistant policy, agent
   credentials and tool configuration.
3. **Classical baseline** — auto-logon, guest accounts, autorun, firewall,
   remote access. Necessary, unglamorous, and still failing in the field, which
   is why it ships first and stays.

## Scope discipline

Being forward-looking is not a licence to ship speculation. Two rules keep this
honest:

- **Every rule must be checkable on a real machine now.** No rule ships for a
  threat we can only describe. If we cannot read it read-only, it stays in this
  document as a thesis, not in `rules/` as a check.
- **The tool stays read-only.** It reports; the operator decides. A scanner that
  reconfigures leased machines would itself become the multi-tenant risk.

The café is the wedge. Multi-tenant AI-equipped endpoints are the market. The
baseline is the product.
