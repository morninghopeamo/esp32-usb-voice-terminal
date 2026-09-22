'use strict';

function assertVolumePercent(percent) {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new RangeError('volume_percent_invalid');
}

function volumePercentToGain(percent) {
  assertVolumePercent(percent);
  return percent === 0 ? 0 : (percent / 100) ** 2;
}

function assertGain(gain) {
  if (!Number.isFinite(gain) || gain < 0 || gain > 1) throw new RangeError('gain_invalid');
}

function applyS16leGain(pcmBuffer, gain) {
  if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length % 2 !== 0) throw new TypeError('pcm_s16le_invalid');
  assertGain(gain);
  if (gain === 0) return Buffer.alloc(pcmBuffer.length);
  const output = Buffer.allocUnsafe(pcmBuffer.length);
  for (let offset = 0; offset < pcmBuffer.length; offset += 2) {
    const scaled = Math.round(pcmBuffer.readInt16LE(offset) * gain);
    output.writeInt16LE(Math.min(32767, Math.max(-32768, scaled)), offset);
  }
  return output;
}

module.exports = { applyS16leGain, volumePercentToGain };
