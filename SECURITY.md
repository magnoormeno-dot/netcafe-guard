# Security Policy

## Scope and intent

netcafe-guard is a **defensive** tool. It is read-only: it reads configuration
and reports risk. It never modifies, exploits, or attacks the machine it runs
on. Contributions that add offensive capability are out of scope.

## Reporting a vulnerability

If you find a security issue in netcafe-guard itself — for example a probe that
could be tricked into running an unintended command, or output that could leak
sensitive data — please report it privately rather than opening a public issue:

1. Open a [GitHub security advisory](https://github.com/magnoormeno-dot/netcafe-guard/security/advisories/new), or
2. Contact the maintainer via their GitHub profile.

Please include steps to reproduce and the affected version. We aim to
acknowledge reports within a few days.

## Supported versions

This project is pre-1.0; security fixes land on the latest release.
