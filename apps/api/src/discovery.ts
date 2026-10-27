import dgram from 'node:dgram';
import { buildDiscoveryBeacon, DISCOVERY_UDP_PORT } from '@pricelens/shared';

export function startDiscoveryBeacon(port: number): { stop: () => void } | null {
  if (process.env.DISCOVERY === '0') return null;

  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('error', (err) => {
    console.error('Discovery UDP socket error:', err);
  });

  socket.bind(() => {
    try {
      socket.setBroadcast(true);
    } catch {
      /* ignore */
    }
  });

  const message = Buffer.from(buildDiscoveryBeacon(port));

  const timer = setInterval(() => {
    try {
      socket.send(message, 0, message.length, DISCOVERY_UDP_PORT, '255.255.255.255', (err) => {
        if (err) {
          /* ignore broadcast errors on disconnected interfaces */
        }
      });
    } catch {
      /* ignore */
    }
  }, 5000);

  return {
    stop: () => {
      clearInterval(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    },
  };
}

