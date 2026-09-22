'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createSerialTransport, normalizeSerialPath } = require('../host/src/serial/serialTransport');
const { createSerialProtocolBridge } = require('../host/src/serial/serialProtocolBridge');
const { RECORD_KIND, createUsbRecordDecoder, encodeRecord } = require('../host/src/serial/usbRecordFraming');
const { POWERSHELL_RESET_SCRIPT, resetCh343Esp32 } = require('../host/src/serial/ch343Esp32Reset');
const { main, parseArgs } = require('../host/bin/voice-terminal');

class FakeSerialPort extends EventEmitter {
  constructor({ openError = null, writeErrors = [] } = {}) {
    super();
    this.openError = openError;
    this.writeErrors = [...writeErrors];
    this.isOpen = false;
    this.writes = [];
  }
  open(callback) {
    if (this.openError) return callback(this.openError);
    this.isOpen = true;
    callback();
  }
  close(callback) {
    const wasOpen = this.isOpen;
    this.isOpen = false;
    if (wasOpen) this.emit('close');
    callback();
  }
  write(bytes, callback) {
    this.writes.push(Buffer.from(bytes));
    callback(this.writeErrors.shift() || null);
  }
  deviceSend(bytes) { this.emit('data', Buffer.from(bytes)); }
  deviceDisconnect() { this.isOpen = false; this.emit('close'); }
}

test('normalizes Windows COM paths and opens with configured serial parameters', async () => {
  assert.equal(normalizeSerialPath('com7', 'win32'), '\\\\.\\COM7');
  assert.equal(normalizeSerialPath('\\\\.\\com7', 'win32'), '\\\\.\\COM7');
  let receivedOptions;
  const port = new FakeSerialPort();
  const transport = createSerialTransport({
    path: 'COM7',
    serialOptions: { baudRate: 230400 },
    portFactory: async (options) => { receivedOptions = options; return port; },
    reconnect: { enabled: false }
  });
  await transport.open();
  assert.equal(transport.getState(), 'open');
  assert.equal(receivedOptions.path, '\\\\.\\COM7');
  assert.equal(receivedOptions.serialOptions.baudRate, 230400);
  await transport.close();
});

test('runs an injected reset strategy before operational serial open', async () => {
  const events = [];
  let completeReset;
  const port = new FakeSerialPort();
  const transport = createSerialTransport({
    path: 'COM4',
    reconnect: { enabled: false },
    resetStrategy: () => new Promise((resolve) => {
      events.push('reset_started');
      completeReset = () => { events.push('reset_completed'); resolve(); };
    }),
    portFactory: async () => {
      events.push('operational_open_started');
      return port;
    }
  });
  const opening = transport.open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['reset_started']);
  completeReset();
  await opening;
  assert.deepEqual(events, ['reset_started', 'reset_completed', 'operational_open_started']);
  await transport.close();
});

test('uses the exact CH343 ESP32 reset sequence and propagates reset failures', async () => {
  let invocation;
  await resetCh343Esp32({
    path: '\\\\.\\com4',
    execFileImpl: (command, args, options, callback) => {
      invocation = { command, args, options };
      callback(null);
    }
  });
  assert.equal(invocation.command, 'powershell.exe');
  assert.equal(invocation.args.at(-1), 'COM4');
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.timeout, 5000);
  assert.equal(invocation.args.at(-2), POWERSHELL_RESET_SCRIPT);
  assert.match(POWERSHELL_RESET_SCRIPT, /\$port\.Open\(\); \$port\.DtrEnable = \$false; \$port\.RtsEnable = \$false; Start-Sleep -Milliseconds 80; \$port\.RtsEnable = \$true; Start-Sleep -Milliseconds 180; \$port\.RtsEnable = \$false; \$port\.DtrEnable = \$false; Start-Sleep -Milliseconds 80 } finally \{ \$port\.Close\(\); \$port\.Dispose\(\) }/);
  const resetFailure = new Error('reset failed');
  await assert.rejects(
    resetCh343Esp32({ path: 'COM4', execFileImpl: (_command, _args, _options, callback) => callback(resetFailure) }),
    (error) => error.code === 'serial_ch343_esp32_reset_failed' && error.cause === resetFailure
  );
});

test('a reset failure prevents the operational port from opening or reporting open state', async () => {
  let operationalOpenAttempts = 0;
  const transport = createSerialTransport({
    path: 'COM4',
    reconnect: { enabled: false },
    resetStrategy: async () => { throw new Error('reset failed'); },
    portFactory: async () => {
      operationalOpenAttempts += 1;
      return new FakeSerialPort();
    }
  });
  await assert.rejects(transport.open(), /reset failed/);
  assert.equal(operationalOpenAttempts, 0);
  assert.notEqual(transport.getState(), 'open');
  await transport.close();
});

test('propagates open failure and schedules a deterministic reconnect', async () => {
  const failures = [];
  let attempts = 0;
  const transport = createSerialTransport({
    path: 'COM8',
    portFactory: async () => new FakeSerialPort({ openError: ++attempts === 1 ? new Error('open failed') : null }),
    reconnect: { delayMs: 5 }
  });
  transport.onError((error) => failures.push(error.message));
  await assert.rejects(transport.open(), /open failed/);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(attempts, 2);
  assert.equal(transport.getState(), 'open');
  assert.deepEqual(failures, ['open failed']);
  await transport.close();
});

test('serial protocol bridge decodes fragmented hello control records', async () => {
  const port = new FakeSerialPort();
  const transport = createSerialTransport({ path: 'COM9', portFactory: async () => port, reconnect: { enabled: false } });
  const controls = [];
  const bridge = createSerialProtocolBridge({ transport, onControl: (message) => controls.push(message) });
  await transport.open();
  const record = encodeRecord(RECORD_KIND.CONTROL, Buffer.from('{"v":1,"type":"hello","controlSeq":1}', 'utf8'));
  port.deviceSend(record.subarray(0, 3));
  port.deviceSend(record.subarray(3));
  assert.deepEqual(controls, [{ v: 1, type: 'hello', controlSeq: 1 }]);
  assert.equal(bridge.getHandshakeState(), 'hello_received');
  await bridge.sendHello(2);
  const outbound = createUsbRecordDecoder().push(port.writes[0]);
  assert.equal(outbound[0].payload.toString('utf8'), '{"v":1,"type":"hello","controlSeq":2}');
  assert.equal(bridge.getHandshakeState(), 'hello_sent');
  port.deviceSend(encodeRecord(RECORD_KIND.CONTROL, Buffer.from('{"v":1,"type":"hello_ok","controlSeq":2}', 'utf8')));
  assert.equal(bridge.getHandshakeState(), 'established');
  bridge.close();
  await transport.close();
});

test('acknowledges concurrent queued writes in order and propagates write failures', async () => {
  const port = new FakeSerialPort({ writeErrors: [null, new Error('write failed')] });
  const errors = [];
  const transport = createSerialTransport({ path: 'COM10', portFactory: async () => port, reconnect: { enabled: false } });
  transport.onError((error) => errors.push(error.message));
  await transport.open();
  const first = transport.write(Buffer.from([1]));
  const second = transport.write(Buffer.from([2]));
  await first;
  await assert.rejects(second, /write failed/);
  assert.deepEqual(port.writes, [Buffer.from([1]), Buffer.from([2])]);
  assert.deepEqual(errors, ['write failed']);
  await transport.close();
});

test('stream errors are reported and trigger a reconnect', async () => {
  const ports = [];
  const errors = [];
  const transport = createSerialTransport({
    path: 'COM13',
    portFactory: async () => { const port = new FakeSerialPort(); ports.push(port); return port; },
    reconnect: { delayMs: 5 }
  });
  transport.onError((error) => errors.push(error.message));
  await transport.open();
  ports[0].emit('error', new Error('stream failed'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(errors, ['stream failed']);
  assert.equal(ports.length, 2);
  assert.equal(transport.getState(), 'open');
  await transport.close();
});

test('unexpected close reconnects, while intentional close cancels pending reconnect', async () => {
  const ports = [];
  const transport = createSerialTransport({
    path: 'COM11',
    portFactory: async () => { const port = new FakeSerialPort(); ports.push(port); return port; },
    reconnect: { delayMs: 20 }
  });
  await transport.open();
  ports[0].deviceDisconnect();
  assert.equal(transport.getState(), 'reconnect_wait');
  await transport.close();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(ports.length, 1);
  assert.equal(transport.getState(), 'closed');
});

test('prevents duplicate opens and reports malformed inbound records through the bridge', async () => {
  let opens = 0;
  const port = new FakeSerialPort();
  const transport = createSerialTransport({
    path: 'COM12',
    portFactory: async () => { opens += 1; return port; },
    reconnect: { enabled: false }
  });
  const errors = [];
  const bridge = createSerialProtocolBridge({ transport, onError: (error) => errors.push(error.code) });
  await Promise.all([transport.open(), transport.open()]);
  assert.equal(opens, 1);
  port.deviceSend(Buffer.from([0x7f, 0, 0, 0, 0]));
  assert.deepEqual(errors, ['record_kind_invalid']);
  bridge.close();
  await transport.close();
});

test('CLI accepts only an explicit serial path', () => {
  assert.deepEqual(parseArgs(['--port', 'COM4']), { path: 'COM4' });
  assert.throws(() => parseArgs([]), /usage:/);
});

test('CLI injects the CH343 ESP32 reset strategy into the generic transport', async () => {
  let options;
  let resetPath;
  const transport = {
    onData: () => () => {},
    onError: () => () => {},
    onState: () => () => {},
    write: async () => {},
    open: async () => options.resetStrategy({ path: '\\\\.\\COM4' }),
    close: async () => {},
    getPath: () => '\\\\.\\COM4'
  };
  const messages = [];
  const result = await main(['--port', 'COM4'], { log: (message) => messages.push(message), error: () => {} }, {
    transportFactory: (received) => { options = received; return transport; },
    resetStrategy: async ({ path }) => { resetPath = path; }
  });
  assert.equal(options.path, 'COM4');
  assert.equal(typeof options.resetStrategy, 'function');
  assert.equal(resetPath, '\\\\.\\COM4');
  assert.deepEqual(messages, ['reset started', 'reset completed', 'connected \\\\.\\COM4']);
  await result.shutdown();
});
