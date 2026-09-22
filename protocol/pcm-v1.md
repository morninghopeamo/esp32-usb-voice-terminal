# PCM frame v1

PCM frames are byte sequences with a 32-byte little-endian header followed immediately by `payloadBytes` bytes of payload. They are normally carried as a USB record of kind `0x02`.

| Offset | Size | Field | Encoding |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `EVT1` |
| 4 | 1 | version | `1` |
| 5 | 1 | kind | `1` capture, `2` playback |
| 6 | 2 | headerBytes | unsigned little-endian integer; must be `32` |
| 8 | 4 | streamId | unsigned little-endian integer |
| 12 | 4 | seq | unsigned little-endian integer |
| 16 | 4 | sampleRate | unsigned little-endian integer, in Hz |
| 20 | 1 | channels | unsigned integer |
| 21 | 1 | bits | unsigned integer |
| 22 | 1 | codec | `1` for signed 16-bit little-endian PCM |
| 23 | 1 | flags | v1 fixed-format validation requires `0` |
| 24 | 4 | payloadBytes | unsigned little-endian integer |
| 28 | 4 | sampleOffset | unsigned little-endian integer |
| 32 | variable | payload | PCM bytes |

The decoder rejects short frames, a non-`EVT1` magic, a version other than `1`, a header size other than `32`, and a total length different from `32 + payloadBytes`.

`seq` and `sampleOffset` are carried as unsigned 32-bit values. The protocol core preserves them but does not impose ordering. A fixed-format validator is provided for the two bundled v1 profiles:

| Direction | Rate | Channels | Bits | Codec | Samples/frame | Payload bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Capture | 16000 | 1 | 16 | 1 | 320 | 640 |
| Playback | 12000 | 1 | 16 | 1 | 480 | 960 |

Example header for a capture frame with stream ID `1`, sequence `0`, and no payload:

```text
45 56 54 31 01 01 20 00 01 00 00 00 00 00 00 00
80 3e 00 00 01 10 01 00 00 00 00 00 00 00 00 00
```
