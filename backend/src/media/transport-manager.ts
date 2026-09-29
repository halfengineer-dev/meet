import { Router } from 'mediasoup/node/lib/Router';
import { WebRtcTransport } from 'mediasoup/node/lib/WebRtcTransport';

export async function createWebRtcTransport(router: Router): Promise<WebRtcTransport> {
  const publicIp = process.env.PUBLIC_IP || '127.0.0.1';

  const transport = await router.createWebRtcTransport({
    listenInfos: [
      {
        protocol: 'udp',
        ip: '0.0.0.0',          // Listen on all network interfaces
        announcedAddress: publicIp // Tell clients to connect to this IP
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress: publicIp
      }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    // Start with a high bitrate since video takes a lot of bandwidth
    initialAvailableOutgoingBitrate: 1000000 
  });

  // Automatically handle transport closure
  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed' || dtlsState === 'failed') {
      transport.close();
    }
  });

  return transport;
}
