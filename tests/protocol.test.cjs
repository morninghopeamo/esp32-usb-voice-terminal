'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const protocol = require('../host/src/protocol/voiceProtocol');

test('accepts a valid v1 control envelope and rejects another version', () => {
  const valid = protocol.parseControlFrame('{"v":1,"type":"heartbeat","controlSeq":4}');
  assert.deepEqual(valid, { ok: true, message: { v: 1, type: 'heartbeat', controlSeq: 4 } });
  assert.deepEqual(protocol.parseControlFrame('{"v":2,"type":"heartbeat","controlSeq":4}'), { ok: false, code: 'control_version_invalid' });
});

test('encodes and decodes a PCM header with a payload', () => {
  const encoded = protocol.encodePcmFrame({
    kind: protocol.PCM_KIND.CAPTURE,
    streamId: 0x01020304,
    seq: 9,
    sampleRate: protocol.CAPTURE_FORMAT.sampleRate,
    channels: 1,
    bits: 16,
    sampleOffset: 320,
    payload: Buffer.from([0xaa, 0x55])
  });
  assert.deepEqual(encoded.subarray(0, 8), Buffer.from([0x45, 0x56, 0x54, 0x31, 0x01, 0x01, 0x20, 0x00]));
  const decoded = protocol.parsePcmFrame(encoded);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.frame.payload, Buffer.from([0xaa, 0x55]));
  assert.equal(decoded.frame.streamId, 0x01020304);
  assert.equal(decoded.frame.sampleOffset, 320);
});

test('rejects invalid PCM magic and payload length', () => {
  const frame = protocol.encodePcmFrame({ kind: 1, streamId: 1, seq: 1, sampleRate: 16000, channels: 1, bits: 16, sampleOffset: 0, payload: Buffer.from([1, 2]) });
  const badMagic = Buffer.from(frame);
  badMagic[0] = 0;
  assert.deepEqual(protocol.parsePcmFrame(badMagic), { ok: false, code: 'pcm_magic_invalid' });
  assert.deepEqual(protocol.parsePcmFrame(frame.subarray(0, -1)), { ok: false, code: 'pcm_payload_length_invalid' });
});
