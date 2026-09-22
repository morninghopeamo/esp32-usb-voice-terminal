'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const protocolHeader = fs.readFileSync(path.join(root, 'firmware', 'esp32-s3', 'include', 'voice_protocol.hpp'), 'utf8');
const protocolSource = fs.readFileSync(path.join(root, 'firmware', 'esp32-s3', 'src', 'voice_protocol.cpp'), 'utf8');
const framingHeader = fs.readFileSync(path.join(root, 'firmware', 'esp32-s3', 'include', 'usb_record_framing.hpp'), 'utf8');

test('firmware declarations match the documented v1 wire constants', () => {
  assert.match(protocolHeader, /kProtocolVersion = 1/);
  assert.match(protocolHeader, /kPcmHeaderBytes = 32/);
  assert.match(protocolHeader, /kCapturePcmKind = 1/);
  assert.match(protocolHeader, /kPlaybackPcmKind = 2/);
  assert.match(protocolSource, /bytes\[0\] = 'E'; bytes\[1\] = 'V'; bytes\[2\] = 'T'; bytes\[3\] = '1'/);
  assert.match(framingHeader, /kUsbRecordHeaderBytes = 5/);
  assert.match(framingHeader, /kMaxUsbRecordPayloadBytes = 1024/);
});
