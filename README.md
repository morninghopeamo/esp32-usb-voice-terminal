# ESP32 USB Voice Terminal

Reference firmware and desktop-host components for framed bidirectional PCM audio over USB serial.

## What it is

This repository defines the portable protocol, record framing, and PCM playback-volume helpers shared by an ESP32-S3 firmware target and a Node.js host target.

## Current public v0.1 scope

Only the protocol and framing core is included:

- versioned JSON control envelopes;
- fixed-layout PCM frames;
- length-prefixed USB record framing; and
- S16LE PCM gain processing.

Hardware capture, hardware playback, USB transport integration, speech services, and a full voice loop are not included or verified in this version.

## Repository structure

- `firmware/esp32-s3/` — portable C++ protocol and record-framing sources for firmware integration.
- `host/src/` — Node.js protocol, record-framing, and playback helpers.
- `protocol/` — v1 wire-format documentation.
- `tests/` — offline deterministic host tests and firmware-source contract checks.

## Status

Public v0.1 is an offline-verified protocol and framing baseline. It is not hardware acceptance evidence.
