#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace voice_terminal {

constexpr uint8_t kProtocolVersion = 1;
constexpr size_t kPcmHeaderBytes = 32;
constexpr uint8_t kCapturePcmKind = 1;
constexpr uint8_t kPlaybackPcmKind = 2;
constexpr uint8_t kPcmS16LeCodec = 1;

struct AudioFormat {
  uint32_t sampleRate;
  uint8_t channels;
  uint8_t bits;
  uint8_t codec;
  uint16_t samplesPerFrame;
  uint16_t payloadBytes;
};

constexpr AudioFormat kCaptureFormat{16000, 1, 16, kPcmS16LeCodec, 320, 640};
constexpr AudioFormat kPlaybackFormat{12000, 1, 16, kPcmS16LeCodec, 480, 960};

enum class ControlType {
  Hello, HelloOk, CaptureRequest, CaptureAccept, CaptureStop, PlayPrepare,
  PlayReady, PlayEnd, PlayFinished, Cancel, Heartbeat, Error, Invalid
};

struct ControlMessage {
  uint8_t version = 0;
  ControlType type = ControlType::Invalid;
  uint32_t controlSeq = 0;
};

struct PcmFrame {
  uint8_t kind = 0;
  uint32_t streamId = 0;
  uint32_t seq = 0;
  uint32_t sampleRate = 0;
  uint8_t channels = 0;
  uint8_t bits = 0;
  uint8_t codec = 0;
  uint8_t flags = 0;
  uint32_t sampleOffset = 0;
  std::vector<uint8_t> payload;
};

const char* controlTypeName(ControlType type);
ControlType parseControlType(const std::string& value);
bool decodeControlEnvelope(const std::string& json, ControlMessage* out, std::string* error);
std::string encodeControlEnvelope(const ControlMessage& message);
bool decodePcmFrame(const std::vector<uint8_t>& bytes, PcmFrame* out, std::string* error);
std::vector<uint8_t> encodePcmFrame(const PcmFrame& frame);
bool validateFixedPcmFrame(const PcmFrame& frame, uint8_t expectedKind, const AudioFormat& format, std::string* error);

}  // namespace voice_terminal
