import { describe, expect, it } from 'vitest';
import { buildDiscoveryBeacon, parseDiscoveryBeacon, DISCOVERY_UDP_PORT } from './discovery';

describe('LAN discovery beacon', () => {
  it('has port 53530', () => {
    expect(DISCOVERY_UDP_PORT).toBe(53530);
  });

  it('builds discovery line', () => {
    expect(buildDiscoveryBeacon(3000)).toBe('pricelens 1 3000');
    expect(buildDiscoveryBeacon(8080)).toBe('pricelens 1 8080');
  });

  it('parses valid beacon lines', () => {
    expect(parseDiscoveryBeacon('pricelens 1 3000')).toEqual({ version: 1, port: 3000 });
    expect(parseDiscoveryBeacon('  pricelens  1  8080  ')).toEqual({ version: 1, port: 8080 });
  });

  it('rejects invalid or unsupported beacon lines', () => {
    expect(parseDiscoveryBeacon('')).toBeNull();
    expect(parseDiscoveryBeacon('other 1 3000')).toBeNull();
    expect(parseDiscoveryBeacon('pricelens 2 3000')).toBeNull();
    expect(parseDiscoveryBeacon('pricelens 1 notanumber')).toBeNull();
    expect(parseDiscoveryBeacon('pricelens 1 70000')).toBeNull();
    expect(parseDiscoveryBeacon('pricelens 1 -1')).toBeNull();
  });
});

