export const DISCOVERY_UDP_PORT = 53530;

export function buildDiscoveryBeacon(port: number): string {
  return `pricelens 1 ${port}`;
}

export function parseDiscoveryBeacon(line: string): { version: number; port: number } | null {
  const match = line.trim().match(/^pricelens\s+(\d+)\s+(\d+)$/);
  if (!match) return null;
  const version = parseInt(match[1]!, 10);
  const port = parseInt(match[2]!, 10);
  if (version !== 1 || Number.isNaN(port) || port < 1 || port > 65535) return null;
  return { version, port };
}

