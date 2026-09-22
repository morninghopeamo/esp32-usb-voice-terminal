'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { applyS16leGain, volumePercentToGain } = require('../host/src/playback/pcmPlaybackVolume');

test('maps volume percent to a bounded gain', () => {
  assert.equal(volumePercentToGain(0), 0);
  assert.equal(volumePercentToGain(50), 0.25);
  assert.equal(volumePercentToGain(100), 1);
});

test('applies unity gain and attenuation without changing input', () => {
  const input = Buffer.alloc(4);
  input.writeInt16LE(10000, 0);
  input.writeInt16LE(-10000, 2);
  assert.deepEqual(applyS16leGain(input, 1), input);
  assert.deepEqual(applyS16leGain(input, 0.25), Buffer.from([0xc4, 0x09, 0x3c, 0xf6]));
  assert.deepEqual(input, Buffer.from([0x10, 0x27, 0xf0, 0xd8]));
});

test('saturates and accepts a zero-length PCM buffer', () => {
  const input = Buffer.alloc(2);
  input.writeInt16LE(32767, 0);
  assert.equal(applyS16leGain(input, 1.0).readInt16LE(0), 32767);
  assert.deepEqual(applyS16leGain(Buffer.alloc(0), 0.5), Buffer.alloc(0));
});
