'use strict';

const PROTOCOL_VERSION = 1;
const PCM_HEADER_BYTES = 32;
const PCM_MAGIC = Buffer.from('EVT1', 'ascii');
const PCM_KIND = Object.freeze({ CAPTURE: 1, PLAYBACK: 2 });
const PCM_CODEC = Object.freeze({ S16LE: 1 });
const CAPTURE_FORMAT = Object.freeze({ sampleRate: 16000, channels: 1, bits: 16, codec: PCM_CODEC.S16LE, samplesPerFrame: 320, payloadBytes: 640 });
const PLAYBACK_FORMAT = Object.freeze({ sampleRate: 12000, channels: 1, bits: 16, codec: PCM_CODEC.S16LE, samplesPerFrame: 480, payloadBytes: 960 });
const CONTROL_TYPES = new Set(['hello', 'hello_ok', 'capture_request', 'capture_accept', 'capture_stop', 'play_prepare', 'play_ready', 'play_end', 'play_finished', 'cancel', 'heartbeat', 'error']);

function protocolError(code) {
  return { ok: false, code };
}

function parseControlFrame(data) {
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) return protocolError('control_binary_not_allowed');
  let message;
  try {
    message = JSON.parse(String(data));
  } catch {
    return protocolError('control_json_invalid');
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return protocolError('control_shape_invalid');
  if (message.v !== PROTOCOL_VERSION) return protocolError('control_version_invalid');
  if (typeof message.type !== 'string' || !CONTROL_TYPES.has(message.type)) return protocolError('control_type_invalid');
  if (!Number.isSafeInteger(message.controlSeq) || message.controlSeq < 1) return protocolError('control_sequence_invalid');
  return { ok: true, message };
}

function encodeControlFrame(message) {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...message });
}

function encodePcmFrame({ kind, streamId, seq, sampleRate, channels, bits, codec = PCM_CODEC.S16LE, flags = 0, sampleOffset, payload }) {
  const pcmPayload = Buffer.isBuffer(payload) ? Buffer.from(payload) : Buffer.from(payload || []);
  const header = Buffer.alloc(PCM_HEADER_BYTES);
  PCM_MAGIC.copy(header, 0);
  header.writeUInt8(PROTOCOL_VERSION, 4);
  header.writeUInt8(kind, 5);
  header.writeUInt16LE(PCM_HEADER_BYTES, 6);
  header.writeUInt32LE(streamId >>> 0, 8);
  header.writeUInt32LE(seq >>> 0, 12);
  header.writeUInt32LE(sampleRate >>> 0, 16);
  header.writeUInt8(channels, 20);
  header.writeUInt8(bits, 21);
  header.writeUInt8(codec, 22);
  header.writeUInt8(flags, 23);
  header.writeUInt32LE(pcmPayload.length, 24);
  header.writeUInt32LE(sampleOffset >>> 0, 28);
  return Buffer.concat([header, pcmPayload]);
}

function parsePcmFrame(frame) {
  const bytes = Buffer.isBuffer(frame) ? frame : Buffer.from(frame || []);
  if (bytes.length < PCM_HEADER_BYTES) return protocolError('pcm_frame_short');
  if (!bytes.subarray(0, 4).equals(PCM_MAGIC)) return protocolError('pcm_magic_invalid');
  if (bytes.readUInt8(4) !== PROTOCOL_VERSION) return protocolError('pcm_version_invalid');
  if (bytes.readUInt16LE(6) !== PCM_HEADER_BYTES) return protocolError('pcm_header_size_invalid');
  const payloadBytes = bytes.readUInt32LE(24);
  if (bytes.length !== PCM_HEADER_BYTES + payloadBytes) return protocolError('pcm_payload_length_invalid');
  return {
    ok: true,
    frame: {
      kind: bytes.readUInt8(5),
      streamId: bytes.readUInt32LE(8),
      seq: bytes.readUInt32LE(12),
      sampleRate: bytes.readUInt32LE(16),
      channels: bytes.readUInt8(20),
      bits: bytes.readUInt8(21),
      codec: bytes.readUInt8(22),
      flags: bytes.readUInt8(23),
      payloadBytes,
      sampleOffset: bytes.readUInt32LE(28),
      payload: Buffer.from(bytes.subarray(PCM_HEADER_BYTES))
    }
  };
}

function validateFixedPcmFrame(frame, expectedKind, format) {
  if (!frame || frame.kind !== expectedKind) return protocolError('pcm_kind_invalid');
  if (frame.sampleRate !== format.sampleRate || frame.channels !== format.channels || frame.bits !== format.bits || frame.codec !== format.codec || frame.flags !== 0) return protocolError('pcm_format_invalid');
  if (frame.payloadBytes !== format.payloadBytes) return protocolError('pcm_frame_size_invalid');
  return { ok: true };
}

module.exports = {
  PROTOCOL_VERSION,
  PCM_HEADER_BYTES,
  PCM_MAGIC,
  PCM_KIND,
  PCM_CODEC,
  CAPTURE_FORMAT,
  PLAYBACK_FORMAT,
  CONTROL_TYPES,
  parseControlFrame,
  encodeControlFrame,
  encodePcmFrame,
  parsePcmFrame,
  validateFixedPcmFrame
};
