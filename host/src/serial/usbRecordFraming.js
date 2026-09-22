'use strict';

const RECORD_HEADER_BYTES = 5;
const MAX_RECORD_PAYLOAD_BYTES = 1024;
const RECORD_KIND = Object.freeze({ CONTROL: 0x01, PCM: 0x02 });

function recordError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isRecordKind(kind) {
  return kind === RECORD_KIND.CONTROL || kind === RECORD_KIND.PCM;
}

function toPayload(payload) {
  return Buffer.isBuffer(payload) ? Buffer.from(payload) : Buffer.from(payload || []);
}

function encodeRecord(kind, payload) {
  if (!isRecordKind(kind)) throw recordError('record_kind_invalid');
  const recordPayload = toPayload(payload);
  if (recordPayload.length > MAX_RECORD_PAYLOAD_BYTES) throw recordError('record_payload_too_large');
  const header = Buffer.alloc(RECORD_HEADER_BYTES);
  header.writeUInt8(kind, 0);
  header.writeUInt32LE(recordPayload.length, 1);
  return Buffer.concat([header, recordPayload]);
}

function createUsbRecordDecoder() {
  let buffered = Buffer.alloc(0);

  function fail(code) {
    buffered = Buffer.alloc(0);
    throw recordError(code);
  }

  function push(chunk) {
    const bytes = toPayload(chunk);
    if (!bytes.length) return [];
    buffered = buffered.length ? Buffer.concat([buffered, bytes]) : bytes;
    const records = [];
    while (buffered.length >= RECORD_HEADER_BYTES) {
      const kind = buffered.readUInt8(0);
      const payloadLength = buffered.readUInt32LE(1);
      if (!isRecordKind(kind)) fail('record_kind_invalid');
      if (payloadLength > MAX_RECORD_PAYLOAD_BYTES) fail('record_payload_too_large');
      const totalLength = RECORD_HEADER_BYTES + payloadLength;
      if (buffered.length < totalLength) break;
      records.push({ kind, payload: Buffer.from(buffered.subarray(RECORD_HEADER_BYTES, totalLength)) });
      buffered = buffered.subarray(totalLength);
    }
    return records;
  }

  return {
    push,
    getBufferedByteLength: () => buffered.length,
    reset: () => { buffered = Buffer.alloc(0); }
  };
}

module.exports = { RECORD_HEADER_BYTES, MAX_RECORD_PAYLOAD_BYTES, RECORD_KIND, encodeRecord, createUsbRecordDecoder };
