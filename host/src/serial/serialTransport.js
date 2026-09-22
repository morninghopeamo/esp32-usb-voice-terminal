'use strict';

const DEFAULT_SERIAL_OPTIONS = Object.freeze({
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  rtscts: false,
  xon: false,
  xoff: false
});

function transportError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function normalizeSerialPath(path, platform = process.platform) {
  const value = String(path || '').trim();
  if (!value) throw transportError('serial_path_invalid');
  if (platform !== 'win32') return value;
  if (/^\\\\\.\\COM\d+$/i.test(value)) return `\\\\.\\${value.slice(4).toUpperCase()}`;
  if (/^COM\d+$/i.test(value)) return `\\\\.\\${value.toUpperCase()}`;
  return value;
}

function normalizeSerialOptions(options = {}) {
  const serial = { ...DEFAULT_SERIAL_OPTIONS, ...options };
  if (!Number.isSafeInteger(serial.baudRate) || serial.baudRate < 300) throw transportError('serial_baud_invalid');
  if (![5, 6, 7, 8].includes(serial.dataBits)) throw transportError('serial_data_bits_invalid');
  if (![1, 1.5, 2].includes(serial.stopBits)) throw transportError('serial_stop_bits_invalid');
  if (!['none', 'even', 'odd', 'mark', 'space'].includes(serial.parity)) throw transportError('serial_parity_invalid');
  for (const key of ['rtscts', 'xon', 'xoff']) {
    if (typeof serial[key] !== 'boolean') throw transportError(`serial_${key}_invalid`);
  }
  return Object.freeze(serial);
}

function createDefaultPortFactory() {
  return async ({ path, serialOptions }) => {
    let SerialPort;
    try {
      ({ SerialPort } = require('serialport'));
    } catch (error) {
      throw transportError('serialport_dependency_missing', error);
    }
    return new SerialPort({ path, ...serialOptions, autoOpen: false });
  };
}

function openPort(port) {
  if (!port || typeof port.open !== 'function') return Promise.reject(transportError('serial_port_invalid'));
  return new Promise((resolve, reject) => port.open((error) => error ? reject(error) : resolve()));
}

function closePort(port) {
  if (!port || typeof port.close !== 'function' || port.isOpen === false) return Promise.resolve();
  return new Promise((resolve) => port.close(() => resolve()));
}

function writePort(port, bytes) {
  if (!port || typeof port.write !== 'function') return Promise.reject(transportError('serial_port_not_open'));
  return new Promise((resolve, reject) => port.write(bytes, (error) => error ? reject(error) : resolve()));
}

function createSerialTransport({ path, serialOptions, portFactory = createDefaultPortFactory(), reconnect = {}, resetStrategy = null } = {}) {
  if (typeof portFactory !== 'function') throw transportError('serial_port_factory_invalid');
  if (resetStrategy !== null && typeof resetStrategy !== 'function') throw transportError('serial_reset_strategy_invalid');
  const normalizedPath = normalizeSerialPath(path);
  const settings = normalizeSerialOptions(serialOptions);
  const reconnectOptions = {
    enabled: reconnect.enabled !== false,
    delayMs: reconnect.delayMs === undefined ? 1000 : reconnect.delayMs
  };
  if (!Number.isSafeInteger(reconnectOptions.delayMs) || reconnectOptions.delayMs < 0) throw transportError('serial_reconnect_delay_invalid');

  const dataListeners = new Set();
  const errorListeners = new Set();
  const closeListeners = new Set();
  const stateListeners = new Set();
  let state = 'idle';
  let desiredOpen = false;
  let port = null;
  let openPromise = null;
  let reconnectTimer = null;
  let writeChain = Promise.resolve();

  function emit(listeners, value) {
    for (const listener of listeners) listener(value);
  }
  function setState(next) {
    if (state === next) return;
    state = next;
    emit(stateListeners, state);
  }
  function report(error) {
    emit(errorListeners, error instanceof Error ? error : transportError('serial_transport_error', error));
  }
  function cancelReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  function scheduleReconnect(reason) {
    if (!desiredOpen || !reconnectOptions.enabled || reconnectTimer || openPromise) return;
    setState('reconnect_wait');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void beginOpen().catch((error) => report(error));
    }, reconnectOptions.delayMs);
    return reason;
  }
  function handleClose(currentPort, unexpected) {
    if (port !== currentPort) return;
    port = null;
    emit(closeListeners, { unexpected });
    if (desiredOpen && unexpected) scheduleReconnect('stream_close');
    else setState('closed');
  }
  function attachPort(currentPort) {
    currentPort.on('data', (chunk) => {
      if (port === currentPort) emit(dataListeners, Buffer.from(chunk));
    });
    currentPort.on('error', (error) => {
      if (port !== currentPort) return;
      report(error);
      void closePort(currentPort);
      handleClose(currentPort, true);
    });
    currentPort.on('close', () => handleClose(currentPort, true));
  }
  async function beginOpen() {
    if (!desiredOpen) return;
    if (state === 'open') return;
    if (openPromise) return openPromise;
    setState('opening');
    let reconnectAfterFailure = false;
    openPromise = (async () => {
      try {
        if (resetStrategy) await resetStrategy({ path: normalizedPath, serialOptions: settings });
        if (!desiredOpen) return;
        const candidate = await portFactory({ path: normalizedPath, serialOptions: settings });
        if (!candidate || typeof candidate.on !== 'function') throw transportError('serial_port_invalid');
        await openPort(candidate);
        if (!desiredOpen) {
          await closePort(candidate);
          return;
        }
        port = candidate;
        attachPort(candidate);
        setState('open');
      } catch (error) {
        if (desiredOpen) {
          const wrapped = error instanceof Error ? error : transportError('serial_open_failed', error);
          report(wrapped);
          reconnectAfterFailure = true;
          throw wrapped;
        }
      } finally {
        openPromise = null;
        if (reconnectAfterFailure) scheduleReconnect('open_failed');
      }
    })();
    return openPromise;
  }
  async function open() {
    desiredOpen = true;
    cancelReconnect();
    return beginOpen();
  }
  async function close() {
    desiredOpen = false;
    cancelReconnect();
    const currentPort = port;
    port = null;
    setState('closing');
    if (currentPort) await closePort(currentPort);
    emit(closeListeners, { unexpected: false });
    setState('closed');
  }
  function write(bytes) {
    const payload = Buffer.from(bytes || []);
    const operation = writeChain.catch(() => {}).then(async () => {
      const currentPort = port;
      if (state !== 'open' || !currentPort) throw transportError('serial_port_not_open');
      try {
        await writePort(currentPort, payload);
      } catch (error) {
        report(error);
        void closePort(currentPort);
        handleClose(currentPort, true);
        throw error;
      }
    });
    writeChain = operation;
    return operation;
  }
  function subscribe(listeners, listener) {
    if (typeof listener !== 'function') throw transportError('serial_listener_invalid');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    open,
    close,
    write,
    onData: (listener) => subscribe(dataListeners, listener),
    onError: (listener) => subscribe(errorListeners, listener),
    onClose: (listener) => subscribe(closeListeners, listener),
    onState: (listener) => subscribe(stateListeners, listener),
    getState: () => state,
    getPath: () => normalizedPath,
    getSerialOptions: () => ({ ...settings })
  });
}

module.exports = { DEFAULT_SERIAL_OPTIONS, createSerialTransport, normalizeSerialOptions, normalizeSerialPath, transportError };
