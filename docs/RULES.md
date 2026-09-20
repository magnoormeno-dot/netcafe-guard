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
| `profiles` | no | Array of venue profile names (the baseline uses `gaming-cafe` and `shared-office`). Omitted or `["all"]` = applies under every profile. With `scan --profile <name>`, rules declaring only other profiles are reported as **skip**; without `--profile` every rule applies. |
| `check` | yes | `{ "fact": "...", "operator": "...", "value": ... }` |
| `evidence` | no | Name of a second fact to carry into the finding as `evidence` — the file labels behind a count, the service name behind a boolean. Shown in text, HTML and JSON output so a report says *what* it saw. |
| `remediation` | recommended | Exactly what to run or click to fix it. This is the most valuable part for the person reading the report. |
| `reference` | no | Where the rule comes from (CIS Benchmark, vendor doc, CVE). |
| `fix` | no | Machine-readable remediation used by `scan --fix-script`. One step or an array of steps — see **Scriptable fixes** below. Omit it when the fix is destructive or needs judgement; the prose `remediation` is then emitted as a comment instead. |

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
- **skip** — the rule does not apply to this platform (`reason: not-applicable`)
  or to the requested `--profile` (`reason: profile-not-applicable`).
- **error** — the rule itself is malformed (the validator normally catches this
  before a scan ever runs).

## Facts

Facts are produced by probes in [`../src/probes.js`](../src/probes.js), grouped
by the priority order in [VISION.md](VISION.md).

**Multi-tenant hygiene** — is this machine clean for the next person?
`sessionRestoreActive`, `sessionRestoreAgent`, `leftoverCredentialCount`,
`leftoverCredentialFiles`, `browserPasswordSavingDisabled`

**AI surface area** — what does the AI here see, keep, and hold?
`recallDisabled`, `recallSnapshotStorePresent`, `gameDvrDisabled`,
`clipboardHistoryDisabled`, `clipboardSyncDisabled`, `copilotPolicySet`,
`copilotDisabled`, `agentToolConfigCount`, `agentToolConfigFiles`,
`aiServiceExposedCount`, `aiServiceExposed`

**Classical baseline (Windows)**
`autoAdminLogon`, `defaultPasswordStored`, `guestAccountActive`, `rdpEnabled`,
`autorunDisabledAllDrives`, `firewallAllProfilesOn`, `defenderRealtimeEnabled`,
`screenLockTimeoutSec`, `screenLockOnResume`

**Cross-platform**
`platform`, `arch`, `hostname`, `osRelease`, `uptimeHours`

### A note on the network-exposure probe

`aiServiceExposed` lists local AI model servers (Ollama, LM Studio, GPT4All,
Jan, KoboldCpp, Gradio-based UIs) whose port is listening on a non-loopback
address, as labels like `Ollama (0.0.0.0:11434)`. It reads `netstat` / `ss`
output and nothing else. Generic ports (8080, 8000, 3000) are deliberately
not in the table — a rule that cries wolf gets switched off. The table lives
in `AI_SERVICE_PORTS` in `src/probes.js`; add a port only if it is
distinctive to one AI serving tool and cite its documentation.

### A note on credential and agent-config probes

`leftoverCredentialFiles` and `agentToolConfigFiles` contain tilde-prefixed
*labels* only (`~/.ssh/id_rsa`, `~/.aws/credentials`, `~/.kube/config`,
`~/.claude.json`, `~/.cursor/mcp.json`, `~/.codex/config.toml`). Probes check
for **existence** and never read the contents of a credential or config file —
a scanner that slurped secrets would itself be the leak. Keep any new probe of
this kind to the same standard.

## Scriptable fixes

`remediation` tells a person what to do. `fix` tells `scan --fix-script` how to
write it as PowerShell — and that script is only ever **printed**, never run.

```json
"fix": {
  "type": "registry",
  "hive": "HKLM",
  "path": "SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI",
  "name": "DisableAIDataAnalysis",
  "kind": "DWord",
  "data": 1
}
```

Three step types:

| `type` | Fields | Emits |
| --- | --- | --- |
| `registry` | `hive`, `path`, `name`, `kind` (`DWord`\|`String`), `data` | creates the key if missing, then sets the value |
| `registry-delete` | `hive`, `path`, `name` | removes that one value |
| `command` | `run` | the command verbatim |

Use an array for a fix that needs several steps (e.g. Chrome *and* Edge policy).
An optional `note` on a step becomes a comment above it.

**When not to add a `fix`.** If the remediation deletes a tenant's files,
installs software, or reconfigures a service, leave `fix` out. Those findings
are printed as `MANUAL` comment blocks carrying the prose remediation, which is
exactly where a decision like "wipe this profile" belongs. Five baseline rules
are deliberately in that group.

Only **failed** checks are scripted. An `unknown` result never produces a
command: the scanner could not read the setting, so writing a value there would
hide a visibility problem instead of fixing it.

## Profiles

The same seat is not the same threat model in every venue, so rules can opt
into venue profiles. The baseline ships two:

- `gaming-cafe` — seats run under a café management/billing client that owns
  the session lifecycle. The OS screen-saver lock rules (`win-screenlock-*`)
  declare `"profiles": ["shared-office"]` and are skipped here, because the
  screensaver is not the control actually in use on these seats.
- `shared-office` — the full baseline, including idle auto-lock.

Untagged rules apply under every profile, and a scan without `--profile`
always evaluates the full baseline. Tag a rule only when a venue type
genuinely handles that control a different way — a profile is not a licence
to relax the baseline.

Need a fact that doesn't exist yet? Add a probe (see
[CONTRIBUTING.md](../CONTRIBUTING.md)). Probes are always read-only and return
`undefined` when they can't tell.

## Testing a rule without a Windows box

Feed facts in directly — no host probing:

```bash
echo '{ "platform":"win32", "arch":"x64", "hostname":"t", "guestAccountActive": true }' > facts.json
node bin/netcafe-guard.js scan --facts facts.json --platform win32
```
