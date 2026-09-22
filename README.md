# ESP32 USB Voice Terminal

Reference firmware and desktop-host components for framed bidirectional PCM audio over USB serial.

## What it is

This repository defines the portable protocol, record framing, a generic Node.js serial transport, and PCM playback-volume helpers shared by an ESP32-S3 firmware target and a Node.js host target.

## Current public v0.1 scope

The offline-verified public core includes:

- versioned JSON control envelopes;
- fixed-layout PCM frames;
- length-prefixed USB record framing; and
- S16LE PCM gain processing; and
- a generic host serial transport with reconnect lifecycle and a separable control-record bridge.

Hardware capture, hardware playback, physical serial-device operation, speech services, and a full voice loop are not included or verified in this version. See `docs/serial-transport.md` for serial parameters, reconnect behavior, optional device-specific reset strategies, and hardware boundaries.

To observe a physical device's control records after installing dependencies, run `node host/bin/voice-terminal.js --port COM4` (replace `COM4` with the device path). The CLI only connects, prints transport/control events, and closes cleanly on Ctrl+C.

## Repository structure

- `firmware/esp32-s3/` — portable C++ protocol and record-framing sources for firmware integration.
- `host/src/` — Node.js protocol, record-framing, serial transport, and playback helpers.
- `protocol/` — v1 wire-format documentation.
- `tests/` — offline deterministic host tests and firmware-source contract checks.

## Status

Public v0.1 is an offline-verified protocol, framing, and host transport baseline. It is not hardware acceptance evidence.
