'use strict';

const { RECORD_KIND, createUsbRecordDecoder, encodeRecord } = require('./usbRecordFraming');
const { encodeControlFrame, parseControlFrame } = require('../protocol/voiceProtocol');

function createSerialProtocolBridge({ transport, onControl = () => {}, onPcm = () => {}, onError = () => {} } = {}) {
  if (!transport || typeof transport.onData !== 'function' || typeof transport.write !== 'function') {
    throw new Error('serial_protocol_transport_invalid');
  }
  const decoder = createUsbRecordDecoder();
  let handshakeState = 'waiting_for_hello';
  const unsubscribe = transport.onData((chunk) => {
    let records;
    try {
      records = decoder.push(chunk);
    } catch (error) {
      onError(error);
      return;
    }
    for (const record of records) {
      if (record.kind === RECORD_KIND.PCM) {
        onPcm(record.payload);
        continue;
      }
      const parsed = parseControlFrame(record.payload.toString('utf8'));
      if (!parsed.ok) {
        const error = new Error(parsed.code);
        error.code = parsed.code;
        onError(error);
        continue;
      }
      if (parsed.message.type === 'hello') handshakeState = 'hello_received';
      if (parsed.message.type === 'hello_ok' && handshakeState === 'hello_sent') handshakeState = 'established';
      onControl(parsed.message);
    }
  });
  return Object.freeze({
    sendControl: (message) => transport.write(encodeRecord(RECORD_KIND.CONTROL, Buffer.from(encodeControlFrame(message), 'utf8'))),
    sendHello: (controlSeq = 1) => {
      handshakeState = 'hello_sent';
      return transport.write(encodeRecord(RECORD_KIND.CONTROL, Buffer.from(encodeControlFrame({ type: 'hello', controlSeq }), 'utf8')));
    },
    getHandshakeState: () => handshakeState,
    close: () => {
      decoder.reset();
      unsubscribe();
    }
  });
}

module.exports = { createSerialProtocolBridge };
