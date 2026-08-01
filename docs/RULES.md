# Rule schema

A rule is a JSON object that maps one **fact** (something the scanner reads from
the host) to a **secure expectation**. If the observed value meets the
expectation, the rule passes; otherwise it fails.

## Fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Unique, stable, kebab-case (e.g. `win-guest-disabled`). Never reuse an id for a different meaning. |
| `title` | yes | One line stating the **secure** state, not the problem. "Guest account is disabled", not "guest account enabled". |
| `severity` | no | `critical` \| `high` \| `medium` \| `low` \| `info`. Defaults to `medium`. Drives the score penalty. |
| `category` | no | Grouping label, e.g. `authentication`, `network`, `session`. |
| `platforms` | no | Array of `win32` \| `linux` \| `darwin` \| `all`. Omitted or `["all"]` = every platform. Non-matching platforms are reported as **skip**. |
| `check` | yes | `{ "fact": "...", "operator": "...", "value": ... }` |
| `remediation` | recommended | Exactly what to run or click to fix it. This is the most valuable part for the person reading the report. |
| `reference` | no | Where the rule comes from (CIS Benchmark, vendor doc, CVE). |

## Operators

| Operator | Passes when | `value` |
| --- | --- | --- |
| `equals` | observed === value | required |
| `notEquals` | observed !== value | required |
| `isTrue` | observed === true | — |
| `isFalse` | observed === false | — |
| `exists` | fact is present | — |
| `absent` | fact is missing | — |
| `oneOf` | observed is in value[] | array |
| `notOneOf` | observed is not in value[] | array |
| `gte` | observed >= value (numbers) | number |
| `lte` | observed <= value (numbers) | number |
| `includes` | observed array contains value | any |

## Statuses

Every evaluated rule ends in one of:

- **pass** — the machine meets the expectation.
- **fail** — it does not; the finding is scored and surfaced.
- **unknown** — the probe could not determine the fact. **This is not a pass.**
  Unknown means "go check this by hand." Only the `absent` operator treats a
  missing fact as satisfied.
- **skip** — the rule does not apply to this platform.
- **error** — the rule itself is malformed (the validator normally catches this
  before a scan ever runs).

## Facts

Facts are produced by probes in [`../src/probes.js`](../src/probes.js), grouped
by the priority order in [VISION.md](VISION.md).

**Multi-tenant hygiene** — is this machine clean for the next person?
`sessionRestoreActive`, `sessionRestoreAgent`, `leftoverCredentialCount`,
`leftoverCredentialFiles`, `browserPasswordSavingDisabled`

**AI surface area** — what does the AI here see, keep, and hold?
`recallDisabled`, `clipboardHistoryDisabled`, `clipboardSyncDisabled`,
`copilotPolicySet`, `copilotDisabled`

**Classical baseline (Windows)**
`autoAdminLogon`, `defaultPasswordStored`, `guestAccountActive`, `rdpEnabled`,
`autorunDisabledAllDrives`, `firewallAllProfilesOn`, `defenderRealtimeEnabled`,
`screenLockTimeoutSec`, `screenLockOnResume`

**Cross-platform**
`platform`, `arch`, `hostname`, `osRelease`, `uptimeHours`

### A note on credential probes

`leftoverCredentialFiles` contains tilde-prefixed *labels* only
(`~/.ssh/id_rsa`, `~/.claude.json`, `~/.codex/auth.json`). Probes check for
**existence** and never read the contents of
a credential file — a scanner that slurped secrets would itself be the leak.
Keep any new credential probe to the same standard.

Need a fact that doesn't exist yet? Add a probe (see
[CONTRIBUTING.md](../CONTRIBUTING.md)). Probes are always read-only and return
`undefined` when they can't tell.

## Testing a rule without a Windows box

Feed facts in directly — no host probing:

```bash
echo '{ "platform":"win32", "arch":"x64", "hostname":"t", "guestAccountActive": true }' > facts.json
node bin/netcafe-guard.js scan --facts facts.json --platform win32
```
