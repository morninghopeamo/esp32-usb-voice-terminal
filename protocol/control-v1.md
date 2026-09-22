# Control protocol v1

Control data is UTF-8 JSON carried as a USB record of kind `0x01`. The v1 core validates this envelope:

```json
{"v":1,"type":"hello","controlSeq":1}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | unsigned integer | Protocol version. v1 requires `1`. |
| `type` | string | One of the control types listed below. |
| `controlSeq` | positive integer | Sender-assigned control sequence value. The core validates positivity but does not enforce ordering. |

Allowed v1 types are `hello`, `hello_ok`, `capture_request`, `capture_accept`, `capture_stop`, `play_prepare`, `play_ready`, `play_end`, `play_finished`, `cancel`, `heartbeat`, and `error`.

The control parser rejects binary input, malformed JSON, an unsupported version, an unknown type, or a non-positive/non-integer `controlSeq`. The v1 core does not interpret application extension properties; control operations that need additional data must define them together with their consuming component.

The portable firmware parser accepts unsigned 32-bit numeric values. The Node.js parser accepts JavaScript safe integers. Interoperable senders must therefore keep `controlSeq` in the unsigned 32-bit range.
