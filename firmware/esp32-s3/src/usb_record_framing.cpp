#include "usb_record_framing.hpp"

namespace voice_terminal {
namespace {

bool validKind(uint8_t value) {
  return value == static_cast<uint8_t>(UsbRecordKind::Control) || value == static_cast<uint8_t>(UsbRecordKind::Pcm);
}

uint32_t read32(const std::vector<uint8_t>& bytes, size_t offset) {
  return static_cast<uint32_t>(bytes[offset]) | (static_cast<uint32_t>(bytes[offset + 1]) << 8) |
      (static_cast<uint32_t>(bytes[offset + 2]) << 16) | (static_cast<uint32_t>(bytes[offset + 3]) << 24);
}

void write32(std::vector<uint8_t>* bytes, size_t offset, uint32_t value) {
  for (size_t index = 0; index < 4; ++index) (*bytes)[offset + index] = static_cast<uint8_t>((value >> (index * 8)) & 0xff);
}

}  // namespace

bool encodeUsbRecord(UsbRecordKind kind, const std::vector<uint8_t>& payload, std::vector<uint8_t>* out, std::string* error) {
  if (!out || !validKind(static_cast<uint8_t>(kind))) { if (error) *error = "record_kind_invalid"; return false; }
  if (payload.size() > kMaxUsbRecordPayloadBytes) { if (error) *error = "record_payload_too_large"; return false; }
  out->assign(kUsbRecordHeaderBytes + payload.size(), 0);
  (*out)[0] = static_cast<uint8_t>(kind);
  write32(out, 1, static_cast<uint32_t>(payload.size()));
  for (size_t index = 0; index < payload.size(); ++index) (*out)[kUsbRecordHeaderBytes + index] = payload[index];
  return true;
}

bool UsbRecordDecoder::push(const std::vector<uint8_t>& chunk, std::vector<UsbRecord>* out, std::string* error) {
  if (!out) { if (error) *error = "record_output_invalid"; return false; }
  buffered_.insert(buffered_.end(), chunk.begin(), chunk.end());
  size_t start = 0;
  while (buffered_.size() - start >= kUsbRecordHeaderBytes) {
    const uint8_t rawKind = buffered_[start];
    const uint32_t payloadLength = read32(buffered_, start + 1);
    if (!validKind(rawKind) || payloadLength > kMaxUsbRecordPayloadBytes) {
      ++start;
      ++resyncedBytes_;
      continue;
    }
    const size_t totalLength = kUsbRecordHeaderBytes + static_cast<size_t>(payloadLength);
    if (buffered_.size() - start < totalLength) break;
    UsbRecord record;
    record.kind = static_cast<UsbRecordKind>(rawKind);
    record.payload.assign(buffered_.begin() + start + kUsbRecordHeaderBytes, buffered_.begin() + start + totalLength);
    out->push_back(record);
    start += totalLength;
  }
  buffered_.erase(buffered_.begin(), buffered_.begin() + start);
  return true;
}

size_t UsbRecordDecoder::bufferedByteCount() const { return buffered_.size(); }
size_t UsbRecordDecoder::resyncedByteCount() const { return resyncedBytes_; }
void UsbRecordDecoder::reset() { buffered_.clear(); resyncedBytes_ = 0; }

}  // namespace voice_terminal
