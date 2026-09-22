'use strict';

const { execFile } = require('node:child_process');

function resetError(cause) {
  const error = new Error('serial_ch343_esp32_reset_failed');
  error.code = 'serial_ch343_esp32_reset_failed';
  error.cause = cause;
  return error;
}

function normalizeComPort(path) {
  const raw = String(path || '').trim();
  const value = /^COM\d+$/i.test(raw)
    ? raw
    : raw.startsWith('\\\\.\\')
      ? raw.slice('\\\\.\\'.length)
      : raw;
  if (!/^COM\d+$/i.test(value)) {
    const error = new Error('serial_ch343_esp32_port_invalid');
    error.code = 'serial_ch343_esp32_port_invalid';
    throw error;
  }
  return value.toUpperCase();
}

// Hardware-specific reset sequence for the CH343 / ESP32-S3 reference board.
// Keep the line states and waits in this order: the reset session is separate
// from the operational serial transport passed to the generic transport layer.
const POWERSHELL_RESET_SCRIPT = '&{ param([string]$ComPort) $port = New-Object System.IO.Ports.SerialPort($ComPort); try { $port.Open(); $port.DtrEnable = $false; $port.RtsEnable = $false; Start-Sleep -Milliseconds 80; $port.RtsEnable = $true; Start-Sleep -Milliseconds 180; $port.RtsEnable = $false; $port.DtrEnable = $false; Start-Sleep -Milliseconds 80 } finally { $port.Close(); $port.Dispose() } }';

function resetCh343Esp32({ path, execFileImpl = execFile } = {}) {
  const comPort = normalizeComPort(path);
  return new Promise((resolve, reject) => {
    execFileImpl('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      POWERSHELL_RESET_SCRIPT,
      comPort
    ], {
      windowsHide: true,
      timeout: 5000
    }, (error) => {
      if (!error) return resolve();
      reject(resetError(error));
    });
  });
}

module.exports = { POWERSHELL_RESET_SCRIPT, normalizeComPort, resetCh343Esp32 };
