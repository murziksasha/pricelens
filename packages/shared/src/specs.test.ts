import { describe, expect, it } from 'vitest';
import { extractLaptopSpecs } from './specs';

const bases: Array<[string, { brand: string; model: string }]> = [
  ['Dell Latitude 5490', { brand: 'Dell', model: 'Latitude 5490' }],
  ['Dell Latitude 7490', { brand: 'Dell', model: 'Latitude 7490' }],
  ['HP ProBook 450 G8', { brand: 'HP', model: 'ProBook 450 G8' }],
  ['Lenovo ThinkPad T480', { brand: 'Lenovo', model: 'ThinkPad T480' }],
  ['Lenovo ThinkPad T14', { brand: 'Lenovo', model: 'ThinkPad T14' }],
  ['ASUS TUF F15', { brand: 'ASUS', model: 'TUF F15' }],
  ['Acer Nitro 5', { brand: 'Acer', model: 'Nitro 5' }],
  ['Apple MacBook Pro 14', { brand: 'Apple', model: 'MacBook Pro 14' }],
  ['Huawei MateBook D 15', { brand: 'Huawei', model: 'MateBook D 15' }],
  ['Dell XPS 13', { brand: 'Dell', model: 'XPS 13' }],
];

describe('extractLaptopSpecs FR-CMP-005', () => {
  it('parses at least 200 varied real-style titles at >= 90% accuracy', () => {
    const rams = [8, 16, 32];
    const storages = [256, 512];
    const cpus = ['i5-8350U', 'i7-1165G7'];
    const formats = [
      (b: string, cpu: string, ram: number, storage: number) =>
        `Ноутбук ${b} ${cpu} ${ram}GB RAM ${storage}GB SSD`,
      (b: string, cpu: string, ram: number, storage: number) =>
        `${b} ${cpu} / ${ram}GB / ${storage}GB`,
      (b: string, cpu: string, ram: number, storage: number) =>
        `Laptop ${b}, ${cpu}, ${ram} ГБ ОЗУ, ${storage} ГБ SSD`,
    ];
    let total = 0;
    let ok = 0;
    for (const [base, expected] of bases) {
      for (const ram of rams) {
        for (const storage of storages) {
          for (const cpu of cpus) {
            for (const format of formats) {
              total++;
              const specs = extractLaptopSpecs(format(base, cpu, ram, storage));
              const cpuOk = specs.cpu?.toLowerCase() === cpu.toLowerCase();
              if (
                specs.brand === expected.brand &&
                specs.model === expected.model &&
                cpuOk &&
                specs.ramGb === ram &&
                specs.storageGb === storage
              ) {
                ok++;
              }
            }
          }
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(200);
    expect(ok / total).toBeGreaterThanOrEqual(0.9);
  });

  it('reads a slash pair, a GPU, a screen size and Ryzen', () => {
    const specs = extractLaptopSpecs('ASUS TUF F15 Ryzen 5 5600H 16/512 RTX 3050 15.6"');
    expect(specs.cpu).toBe('Ryzen 5 5600H');
    expect(specs.ramGb).toBe(16);
    expect(specs.storageGb).toBe(512);
    expect(specs.gpu).toBe('RTX 3050');
    expect(specs.screenIn).toBe(15.6);
  });
});
