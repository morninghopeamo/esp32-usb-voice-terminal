#!/usr/bin/env node
'use strict';

const { createSerialTransport } = require('../src/serial/serialTransport');
const { createSerialProtocolBridge } = require('../src/serial/serialProtocolBridge');

function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--port' || !String(args[1]).trim()) {
    throw new Error('usage: node host/bin/voice-terminal.js --port <serial-path>');
  }
  return { path: args[1] };
}

async function main(args = process.argv.slice(2), io = console) {
  const { path } = parseArgs(args);
  const transport = createSerialTransport({ path });
  const bridge = createSerialProtocolBridge({
    transport,
    onControl: (message) => io.log(`control ${JSON.stringify(message)}`),
    onError: (error) => io.error(`protocol-error ${error.code || error.message}`)
  });
  transport.onState((state) => io.log(`transport ${state}`));
  transport.onError((error) => io.error(`transport-error ${error.code || error.message}`));
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    bridge.close();
    await transport.close();
  }
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  await transport.open();
  io.log(`connected ${transport.getPath()}`);
  return { transport, bridge, shutdown };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.code || error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
