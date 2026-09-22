# Host serial transport

The host serial transport is a generic Node.js byte-stream layer. It opens a configured serial path, delivers inbound bytes, serializes outbound writes, and can reconnect after an unintentional failure. It does not itself implement capture, playback, speech recognition, speech synthesis, or an agent.

## Serial parameters

`createSerialTransport` defaults to 115200 baud, 8 data bits, one stop bit, no parity, and no flow control. Callers may configure these values for their device. On Windows, `COM7` is normalized to `\\.\\COM7`; non-COM paths are left unchanged. The production opener uses the `serialport` package, while tests inject a fake port factory and never access a COM device.

## Lifecycle and reconnect

States are `idle`, `opening`, `open`, `reconnect_wait`, `closing`, and `closed`. Writes resolve only after the serial port acknowledges them; a failed write rejects its caller and is reported to error subscribers. An unexpected stream error or close schedules a reconnect when enabled. `close()` is intentional shutdown: it clears the reconnect timer and prevents a later retry.

## Protocol boundary

`createSerialProtocolBridge` is separate from transport. It feeds transport bytes to the existing USB record decoder and parses control records with the v1 control parser. It reports a received `hello` and can send a neutral v1 `hello`; it does not authenticate, accept capabilities, or establish a production security policy.

## USB serial implementation

The Node.js implementation uses `serialport` only at the physical-port boundary. The logical control protocol and USB record framing do not depend on that package or on a particular USB bridge. A fake port factory supplies the offline test boundary.

## Reset strategies and hardware assumptions

The generic transport never toggles serial control lines by default. A caller may provide an explicit `resetStrategy` when a particular board, USB bridge, and wiring require one. For example, a CH343-based reference bridge may need a board-specific reset sequence, but that sequence is deliberately not a default or a USB CDC claim. Such a strategy must be validated for its exact hardware and wiring. This repository has only offline transport coverage in this round: no physical serial bridge, reset pulse, or end-to-end voice path has been hardware-verified.
