'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Probes gather "facts" about the current machine. Every probe is READ-ONLY
 * and best-effort: if it cannot determine something (no permission, command
 * missing, unexpected output) it returns `undefined`, which the engine treats
 * as "unknown" rather than "safe".
 *
 * Nothing here modifies the system. That is a hard rule for this project — a
 * security auditor that changes the machine it audits is a liability.
 */

function run(cmd, args, timeout = 4000) {
  try {
    return execFileSync(cmd, args, {
      timeout,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString();
  } catch (_err) {
    return undefined;
  }
}

/* ---------- Windows probes (read-only) ---------- */

function regQuery(keyPath, valueName) {
  const out = run('reg', ['query', keyPath, '/v', valueName]);
  if (!out) return undefined;
  // Example line:  "    AutoAdminLogon    REG_SZ    1"
  const re = new RegExp(`${valueName}\\s+REG_\\w+\\s+(.+)`, 'i');
  const m = out.match(re);
  return m ? m[1].trim() : undefined;
}

function probeWindows(facts) {
  const winlogon = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon';

  const autoLogon = regQuery(winlogon, 'AutoAdminLogon');
  if (autoLogon !== undefined) facts.autoAdminLogon = autoLogon === '1';

  const defaultPassword = regQuery(winlogon, 'DefaultPassword');
  // If the value exists at all, a cleartext password is stored in the registry.
  facts.defaultPasswordStored = defaultPassword !== undefined;

  const guest = run('net', ['user', 'guest']);
  if (guest) {
    const m = guest.match(/Account active\s+(\w+)/i);
    if (m) facts.guestAccountActive = /yes/i.test(m[1]);
  }

  const rdpDeny = regQuery('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server', 'fDenyTSConnections');
  if (rdpDeny !== undefined) {
    const n = parseInt(rdpDeny, 16) || parseInt(rdpDeny, 10);
    facts.rdpEnabled = n === 0;
  }

  const autorun = regQuery(
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer',
    'NoDriveTypeAutoRun'
  );
  if (autorun !== undefined) {
    const n = parseInt(autorun, 16) || parseInt(autorun, 10);
    // 0xFF (255) disables autorun on all drive types.
    facts.autorunDisabledAllDrives = n === 255;
  }

  const fw = run('netsh', ['advfirewall', 'show', 'allprofiles', 'state']);
  if (fw) {
    // Firewall counts as ON only if no profile reports OFF.
    facts.firewallAllProfilesOn = !/State\s+OFF/i.test(fw) && /State\s+ON/i.test(fw);
  }

  const defender = run('powershell', [
    '-NoProfile',
    '-Command',
    '(Get-MpComputerStatus).RealTimeProtectionEnabled'
  ]);
  if (defender !== undefined) {
    if (/true/i.test(defender)) facts.defenderRealtimeEnabled = true;
    else if (/false/i.test(defender)) facts.defenderRealtimeEnabled = false;
  }

  const screenSaverTimeout = regQuery('HKCU\\Control Panel\\Desktop', 'ScreenSaveTimeOut');
  if (screenSaverTimeout !== undefined) {
    const n = parseInt(screenSaverTimeout, 10);
    if (!Number.isNaN(n)) facts.screenLockTimeoutSec = n;
  }
  const screenSaverSecure = regQuery('HKCU\\Control Panel\\Desktop', 'ScreenSaverIsSecure');
  if (screenSaverSecure !== undefined) facts.screenLockOnResume = screenSaverSecure === '1';

  probeAiSurface(facts);
  probeSessionRestore(facts);
}

/* ---------- AI surface probes (Windows) ---------- */

/**
 * What does the AI on this endpoint see, keep, and hold?
 *
 * On a leased machine these features are multi-tenant leaks, not conveniences:
 * a screen-recall snapshot of the previous tenant's banking session, or their
 * password sitting in clipboard history, is readable by whoever sits down next.
 * See docs/VISION.md.
 */
function probeAiSurface(facts) {
  // Windows Recall / "AI data analysis" — periodic screenshots of everything.
  // Policy value 1 means the capture feature is disabled.
  const recallPolicy =
    regQuery('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis') ||
    regQuery('HKCU\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis');
  if (recallPolicy !== undefined) {
    const n = parseInt(recallPolicy, 16) || parseInt(recallPolicy, 10);
    facts.recallDisabled = n === 1;
  }

  // Windows Copilot — an assistant with system reach on a machine shared by
  // strangers. Venues should decide deliberately, not inherit the default.
  const copilotOff =
    regQuery('HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot') ||
    regQuery('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot');
  if (copilotOff !== undefined) {
    const n = parseInt(copilotOff, 16) || parseInt(copilotOff, 10);
    facts.copilotPolicySet = true;
    facts.copilotDisabled = n === 1;
  }

  // Clipboard history: one tenant's copied password, readable by the next.
  const clipHistory = regQuery(
    'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
    'AllowClipboardHistory'
  );
  if (clipHistory !== undefined) {
    const n = parseInt(clipHistory, 16) || parseInt(clipHistory, 10);
    facts.clipboardHistoryDisabled = n === 0;
  }

  // Cross-device clipboard sync pushes local clipboard content off the machine.
  const clipSync = regQuery(
    'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
    'AllowCrossDeviceClipboard'
  );
  if (clipSync !== undefined) {
    const n = parseInt(clipSync, 16) || parseInt(clipSync, 10);
    facts.clipboardSyncDisabled = n === 0;
  }

  // Browser password managers on a leased seat persist credentials for the
  // next tenant. Policy value 0 disables saving.
  const chromePw = regQuery('HKLM\\SOFTWARE\\Policies\\Google\\Chrome', 'PasswordManagerEnabled');
  const edgePw = regQuery('HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', 'PasswordManagerEnabled');
  const values = [chromePw, edgePw].filter((v) => v !== undefined);
  if (values.length) {
    facts.browserPasswordSavingDisabled = values.every((v) => {
      const n = parseInt(v, 16) || parseInt(v, 10);
      return n === 0;
    });
  }
}

/* ---------- Multi-tenant hygiene probes ---------- */

/**
 * Return the name of the first detected service from `names`, else undefined.
 */
function detectService(names) {
  for (const name of names) {
    const out = run('sc', ['query', name]);
    if (out && /SERVICE_NAME|STATE/i.test(out)) return name;
  }
  return undefined;
}

/**
 * Is anything guaranteeing this machine is clean for the next person?
 * Session restore / write protection is the foundational control for leased
 * computing: without it, nothing else on the machine can be trusted between
 * tenants.
 */
function probeSessionRestore(facts) {
  // Known write-filter / disk-restore agents. Café management suites vary by
  // region — contributions welcome (see CONTRIBUTING.md).
  const found = detectService(['DFServ', 'DeepFrz', 'uwfservicingsvc', 'EWF']);
  facts.sessionRestoreAgent = found;
  facts.sessionRestoreActive = found !== undefined;
}

/**
 * Relative home-dir paths checked for leftover tenant credentials.
 * Existence checks ONLY — never read file contents.
 */
const LEFTOVER_CREDENTIAL_CANDIDATES = [
  '.ssh/id_rsa',
  '.ssh/id_ed25519',
  '.ssh/id_ecdsa',
  '.aws/credentials',
  '.azure/msal_token_cache.bin',
  '.config/gcloud/credentials.db',
  '.config/gcloud/legacy_credentials',
  '.kube/config',
  '.docker/config.json',
  '.terraform.d/credentials.tfrc.json',
  '.netrc',
  '.claude/.credentials.json',
  '.claude.json',
  '.codex/auth.json',
  '.config/gh/hosts.yml',
  '.config/openai',
  'AppData/Roaming/Claude/claude_desktop_config.json'
];

/**
 * Credential material left in a home directory becomes a free identity for the
 * next tenant — and an AI agent key bills someone else.
 *
 * Existence checks ONLY. This probe never reads the contents of a credential
 * file; a scanner that slurped secrets would itself be the leak.
 */
function probeLeftoverCredentials(facts) {
  const home = os.homedir();
  if (!home) return;

  const found = [];
  for (const rel of LEFTOVER_CREDENTIAL_CANDIDATES) {
    const full = path.join(home, ...rel.split('/'));
    try {
      if (fs.existsSync(full)) found.push('~/' + rel);
    } catch (_err) {
      /* unreadable path — treat as not found rather than crashing the scan */
    }
  }
  facts.leftoverCredentialFiles = found;
  facts.leftoverCredentialCount = found.length;
}

/* ---------- Cross-platform probes ---------- */

function probeCommon(facts) {
  facts.platform = process.platform;
  facts.arch = process.arch;
  facts.hostname = os.hostname();
  facts.osRelease = os.release();
  facts.uptimeHours = Math.round((os.uptime() / 3600) * 10) / 10;
  probeLeftoverCredentials(facts);
}

/**
 * Gather every fact we can from this host.
 * `overrides` lets tests or `--facts` inject values without touching the OS.
 */
function gatherFacts(overrides = {}) {
  const facts = {};
  probeCommon(facts);
  if (process.platform === 'win32') {
    probeWindows(facts);
  }
  return { ...facts, ...overrides };
}

module.exports = {
  gatherFacts,
  run,
  regQuery,
  detectService,
  probeAiSurface,
  probeSessionRestore,
  probeLeftoverCredentials,
  LEFTOVER_CREDENTIAL_CANDIDATES
};
