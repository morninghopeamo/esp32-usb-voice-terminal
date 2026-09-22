#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace voice_terminal {

constexpr size_t kUsbRecordHeaderBytes = 5;
constexpr uint32_t kMaxUsbRecordPayloadBytes = 1024;

enum class UsbRecordKind : uint8_t { Control = 0x01, Pcm = 0x02 };

struct UsbRecord {
  UsbRecordKind kind;
  std::vector<uint8_t> payload;
};

bool encodeUsbRecord(UsbRecordKind kind, const std::vector<uint8_t>& payload, std::vector<uint8_t>* out, std::string* error);

class UsbRecordDecoder {
 public:
  bool push(const std::vector<uint8_t>& chunk, std::vector<UsbRecord>* out, std::string* error);
  size_t bufferedByteCount() const;
  size_t resyncedByteCount() const;
  void reset();

 private:
  std::vector<uint8_t> buffered_;
  size_t resyncedBytes_ = 0;
};

}  // namespace voice_terminal
