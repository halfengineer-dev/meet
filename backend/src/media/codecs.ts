import { RtpCodecCapability } from 'mediasoup/node/lib/RtpParameters';

// These are the video and audio codecs that the mediasoup SFU will support
// It matches what standard browsers (Chrome, Safari, Firefox) and mobile devices support
export const mediaCodecs: RtpCodecCapability[] = [
  // Audio codec (Opus is the standard for WebRTC)
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  // Video codec VP8 (widely supported, good fallback)
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
  // Video codec VP9 (better compression, supported on most modern devices)
  {
    kind: 'video',
    mimeType: 'video/VP9',
    clockRate: 90000,
    parameters: {
      'profile-id': 2,
      'x-google-start-bitrate': 1000,
    },
  },
  // Video codec H264 (hardware accelerated on iOS/Mac, very important for performance)
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];
