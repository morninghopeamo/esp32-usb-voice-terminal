#include "voice_protocol.hpp"

#include <cctype>
#include <limits>
#include <sstream>

namespace voice_terminal {
namespace {

bool extractUint(const std::string& json, const char* key, uint32_t* out) {
  const std::string quotedKey = std::string("\"") + key + "\"";
  const size_t keyPos = json.find(quotedKey);
  if (keyPos == std::string::npos) return false;
  const size_t colon = json.find(':', keyPos + quotedKey.length());
  if (colon == std::string::npos) return false;
  size_t cursor = colon + 1;
  while (cursor < json.length() && std::isspace(static_cast<unsigned char>(json[cursor]))) ++cursor;
  if (cursor == json.length() || !std::isdigit(static_cast<unsigned char>(json[cursor]))) return false;
  uint64_t value = 0;
  while (cursor < json.length() && std::isdigit(static_cast<unsigned char>(json[cursor]))) {
    value = value * 10 + static_cast<uint64_t>(json[cursor] - '0');
    if (value > std::numeric_limits<uint32_t>::max()) return false;
    ++cursor;
  }
  *out = static_cast<uint32_t>(value);
  return true;
}

bool extractString(const std::string& json, const char* key, std::string* out) {
  const std::string quotedKey = std::string("\"") + key + "\"";
  const size_t keyPos = json.find(quotedKey);
  if (keyPos == std::string::npos) return false;
  const size_t colon = json.find(':', keyPos + quotedKey.length());
  if (colon == std::string::npos) return false;
  size_t cursor = colon + 1;
  while (cursor < json.length() && std::isspace(static_cast<unsigned char>(json[cursor]))) ++cursor;
  if (cursor == json.length() || json[cursor] != '\"') return false;
  ++cursor;
  out->clear();
  while (cursor < json.length()) {
    const char current = json[cursor++];
    if (current == '\"') return true;
    if (current == '\\') {
      if (cursor == json.length()) return false;
      const char escaped = json[cursor++];
      if (escaped != '\"' && escaped != '\\' && escaped != '/') return false;
      out->push_back(escaped);
    } else {
      out->push_back(current);
    }
  }
  return false;
}

uint16_t read16(const std::vector<uint8_t>& bytes, size_t offset) {
  return static_cast<uint16_t>(bytes[offset]) | (static_cast<uint16_t>(bytes[offset + 1]) << 8);
}

uint32_t read32(const std::vector<uint8_t>& bytes, size_t offset) {
  return static_cast<uint32_t>(bytes[offset]) | (static_cast<uint32_t>(bytes[offset + 1]) << 8) |
      (static_cast<uint32_t>(bytes[offset + 2]) << 16) | (static_cast<uint32_t>(bytes[offset + 3]) << 24);
}

void write16(std::vector<uint8_t>* bytes, size_t offset, uint16_t value) {
  (*bytes)[offset] = static_cast<uint8_t>(value & 0xff);
  (*bytes)[offset + 1] = static_cast<uint8_t>((value >> 8) & 0xff);
}

void write32(std::vector<uint8_t>* bytes, size_t offset, uint32_t value) {
  for (size_t index = 0; index < 4; ++index) (*bytes)[offset + index] = static_cast<uint8_t>((value >> (index * 8)) & 0xff);
}

}  // namespace

const char* controlTypeName(ControlType type) {
  switch (type) {
    case ControlType::Hello: return "hello";
    case ControlType::HelloOk: return "hello_ok";
    case ControlType::CaptureRequest: return "capture_request";
    case ControlType::CaptureAccept: return "capture_accept";
    case ControlType::CaptureStop: return "capture_stop";
    case ControlType::PlayPrepare: return "play_prepare";
    case ControlType::PlayReady: return "play_ready";
    case ControlType::PlayEnd: return "play_end";
    case ControlType::PlayFinished: return "play_finished";
    case ControlType::Cancel: return "cancel";
    case ControlType::Heartbeat: return "heartbeat";
    case ControlType::Error: return "error";
    default: return "";
  }
}

ControlType parseControlType(const std::string& value) {
  const ControlType all[] = {ControlType::Hello, ControlType::HelloOk, ControlType::CaptureRequest, ControlType::CaptureAccept, ControlType::CaptureStop, ControlType::PlayPrepare, ControlType::PlayReady, ControlType::PlayEnd, ControlType::PlayFinished, ControlType::Cancel, ControlType::Heartbeat, ControlType::Error};
  for (const ControlType type : all) if (value == controlTypeName(type)) return type;
  return ControlType::Invalid;
}

bool decodeControlEnvelope(const std::string& json, ControlMessage* out, std::string* error) {
  if (!out || json.empty() || json.front() != '{' || json.back() != '}') { if (error) *error = "control_json_invalid"; return false; }
  uint32_t version = 0;
  std::string type;
  ControlMessage parsed;
  if (!extractUint(json, "v", &version) || version != kProtocolVersion) { if (error) *error = "control_version_invalid"; return false; }
  if (!extractString(json, "type", &type) || (parsed.type = parseControlType(type)) == ControlType::Invalid) { if (error) *error = "control_type_invalid"; return false; }
  if (!extractUint(json, "controlSeq", &parsed.controlSeq) || parsed.controlSeq < 1) { if (error) *error = "control_sequence_invalid"; return false; }
  parsed.version = static_cast<uint8_t>(version);
  *out = parsed;
  return true;
}

std::string encodeControlEnvelope(const ControlMessage& message) {
  std::ostringstream json;
  json << "{\"v\":" << static_cast<unsigned>(kProtocolVersion) << ",\"type\":\"" << controlTypeName(message.type) << "\",\"controlSeq\":" << message.controlSeq << '}';
  return json.str();
}

bool decodePcmFrame(const std::vector<uint8_t>& bytes, PcmFrame* out, std::string* error) {
  if (!out || bytes.size() < kPcmHeaderBytes) { if (error) *error = "pcm_frame_short"; return false; }
  if (bytes[0] != 'E' || bytes[1] != 'V' || bytes[2] != 'T' || bytes[3] != '1') { if (error) *error = "pcm_magic_invalid"; return false; }
  if (bytes[4] != kProtocolVersion) { if (error) *error = "pcm_version_invalid"; return false; }
  if (read16(bytes, 6) != kPcmHeaderBytes) { if (error) *error = "pcm_header_size_invalid"; return false; }
  const uint32_t payloadBytes = read32(bytes, 24);
  if (bytes.size() != kPcmHeaderBytes + payloadBytes) { if (error) *error = "pcm_payload_length_invalid"; return false; }
  PcmFrame parsed;
  parsed.kind = bytes[5];
  parsed.streamId = read32(bytes, 8);
  parsed.seq = read32(bytes, 12);
  parsed.sampleRate = read32(bytes, 16);
  parsed.channels = bytes[20];
  parsed.bits = bytes[21];
  parsed.codec = bytes[22];
  parsed.flags = bytes[23];
  parsed.sampleOffset = read32(bytes, 28);
  parsed.payload.assign(bytes.begin() + kPcmHeaderBytes, bytes.end());
  *out = parsed;
  return true;
}

std::vector<uint8_t> encodePcmFrame(const PcmFrame& frame) {
  std::vector<uint8_t> bytes(kPcmHeaderBytes + frame.payload.size());
  bytes[0] = 'E'; bytes[1] = 'V'; bytes[2] = 'T'; bytes[3] = '1';
  bytes[4] = kProtocolVersion; bytes[5] = frame.kind;
  write16(&bytes, 6, static_cast<uint16_t>(kPcmHeaderBytes));
  write32(&bytes, 8, frame.streamId); write32(&bytes, 12, frame.seq); write32(&bytes, 16, frame.sampleRate);
  bytes[20] = frame.channels; bytes[21] = frame.bits; bytes[22] = frame.codec; bytes[23] = frame.flags;
  write32(&bytes, 24, static_cast<uint32_t>(frame.payload.size()));
  write32(&bytes, 28, frame.sampleOffset);
  for (size_t index = 0; index < frame.payload.size(); ++index) bytes[kPcmHeaderBytes + index] = frame.payload[index];
  return bytes;
}

bool validateFixedPcmFrame(const PcmFrame& frame, uint8_t expectedKind, const AudioFormat& format, std::string* error) {
  if (frame.kind != expectedKind) { if (error) *error = "pcm_kind_invalid"; return false; }
  if (frame.sampleRate != format.sampleRate || frame.channels != format.channels || frame.bits != format.bits || frame.codec != format.codec || frame.flags != 0) { if (error) *error = "pcm_format_invalid"; return false; }
  if (frame.payload.size() != format.payloadBytes) { if (error) *error = "pcm_frame_size_invalid"; return false; }
  return true;
}

}  // namespace voice_terminal
