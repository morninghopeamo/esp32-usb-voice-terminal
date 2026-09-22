'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { RECORD_HEADER_BYTES, RECORD_KIND, encodeRecord, createUsbRecordDecoder } = require('../host/src/serial/usbRecordFraming');

test('encodes and decodes one complete record', () => {
  const record = encodeRecord(RECORD_KIND.CONTROL, Buffer.from([1, 2, 3]));
  assert.deepEqual(record, Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 1, 2, 3]));
  const decoder = createUsbRecordDecoder();
  assert.deepEqual(decoder.push(record), [{ kind: RECORD_KIND.CONTROL, payload: Buffer.from([1, 2, 3]) }]);
});

test('buffers fragmented input until a complete record is available', () => {
  const record = encodeRecord(RECORD_KIND.PCM, Buffer.from([7, 8, 9, 10]));
  const decoder = createUsbRecordDecoder();
  assert.deepEqual(decoder.push(record.subarray(0, 2)), []);
  assert.deepEqual(decoder.push(record.subarray(2, RECORD_HEADER_BYTES + 2)), []);
  assert.equal(decoder.getBufferedByteLength(), RECORD_HEADER_BYTES + 2);
  assert.deepEqual(decoder.push(record.subarray(RECORD_HEADER_BYTES + 2)), [{ kind: RECORD_KIND.PCM, payload: Buffer.from([7, 8, 9, 10]) }]);
});

test('emits coalesced records and retains a partial tail', () => {
  const first = encodeRecord(RECORD_KIND.CONTROL, Buffer.from([1]));
  const second = encodeRecord(RECORD_KIND.PCM, Buffer.from([2, 3]));
  const third = encodeRecord(RECORD_KIND.CONTROL, Buffer.from([4, 5]));
  const decoder = createUsbRecordDecoder();
  assert.deepEqual(decoder.push(Buffer.concat([first, second, third.subarray(0, 4)])), [
    { kind: RECORD_KIND.CONTROL, payload: Buffer.from([1]) },
    { kind: RECORD_KIND.PCM, payload: Buffer.from([2, 3]) }
  ]);
  assert.equal(decoder.getBufferedByteLength(), 4);
  assert.deepEqual(decoder.push(third.subarray(4)), [{ kind: RECORD_KIND.CONTROL, payload: Buffer.from([4, 5]) }]);
});

test('rejects corruption without dispatching a record', () => {
  const decoder = createUsbRecordDecoder();
  assert.throws(() => decoder.push(Buffer.from([0x7f, 0, 0, 0, 0])), { code: 'record_kind_invalid' });
  assert.equal(decoder.getBufferedByteLength(), 0);
});
