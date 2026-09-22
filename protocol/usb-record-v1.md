# USB record framing v1

USB byte streams are divided into records using a 5-byte header followed by a payload.

| Offset | Size | Field | Encoding |
| ---: | ---: | --- | --- |
| 0 | 1 | kind | `0x01` control or `0x02` PCM |
| 1 | 4 | payloadLength | unsigned little-endian integer |
| 5 | variable | payload | exactly `payloadLength` bytes |

The v1 maximum payload length is 1024 bytes. This covers the bundled 992-byte PCM frame (32-byte header plus a 960-byte playback payload).

The host incremental decoder accepts fragmented headers and payloads, emits all complete coalesced records in wire order, and retains a partial tail. An invalid kind or oversized declared length clears its buffer and raises an error.

The firmware decoder uses the same framing and limit, but handles a malformed header by advancing one byte at a time until it finds a plausible header. It exposes the number of skipped bytes for diagnostics. Both decoders require a complete payload before emitting a record.

Example control record containing the three-field control envelope:

```text
01 29 00 00 00 7b 22 76 22 3a 31 2c 22 74 79 70 65
22 3a 22 68 65 61 72 74 62 65 61 74 22 2c 22 63 6f
6e 74 72 6f 6c 53 65 71 22 3a 31 7d
```
