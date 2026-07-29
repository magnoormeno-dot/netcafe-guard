'use strict';

const os = require('os');
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
}

/* ---------- Cross-platform probes ---------- */

function probeCommon(facts) {
  facts.platform = process.platform;
  facts.arch = process.arch;
  facts.hostname = os.hostname();
  facts.osRelease = os.release();
  facts.uptimeHours = Math.round((os.uptime() / 3600) * 10) / 10;
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

module.exports = { gatherFacts, run, regQuery };
