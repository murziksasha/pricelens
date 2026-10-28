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

const popularUsed: Array<[string, Partial<ReturnType<typeof extractLaptopSpecs>>]> = [
  ['Ноутбук Lenovo Legion 5 15ACH6 Ryzen 5 5600H 16GB 512GB RTX 3050', { brand: 'Lenovo', model: 'Legion 5', cpu: 'Ryzen 5 5600H', ramGb: 16, storageGb: 512, gpu: 'RTX 3050' }],
  ['HP ZBook 15 G5 i7-8850H 32gb 512 ssd', { brand: 'HP', model: 'ZBook 15 G5', cpu: 'i7-8850H', ramGb: 32, storageGb: 512 }],
  ['Lenovo ThinkBook 15 G2 i5-1135G7 8/256', { brand: 'Lenovo', model: 'ThinkBook 15 G2', ramGb: 8, storageGb: 256 }],
  ['Dell Latitude 5490 i5-8350U 8 ГБ ОЗУ SSD 256 ГБ', { brand: 'Dell', model: 'Latitude 5490', ramGb: 8, storageGb: 256 }],
  ['MacBook Air M1 8/256', { brand: 'Apple', model: 'MacBook Air', cpu: 'M1', ramGb: 8, storageGb: 256 }],
  ['Asus TUF Gaming F15 i5-11400H 16 GB 512 GB RTX 3050', { brand: 'ASUS', model: 'TUF F15', ramGb: 16, storageGb: 512 }],
  ['Lenovo ThinkPad T480s i5 8250u 16gb 256gb', { brand: 'Lenovo', model: 'ThinkPad T480S', cpu: 'i5-8250U', ramGb: 16, storageGb: 256 }],
  ['HP ProBook 450 G8 15.6" i5-1135G7 8GB 1TB', { brand: 'HP', model: 'ProBook 450 G8', ramGb: 8, storageGb: 1024, screenIn: 15.6 }],
  ['HP Victus 16 Ryzen 5 5600H 16GB 512GB', { brand: 'HP', model: 'Victus 16' }],
  ['Acer Swift 3 i5-1135G7 8GB 512GB', { brand: 'Acer', model: 'Swift 3' }],
  ['Dell G15 5520 i7-12700H 16GB 1TB RTX 3060', { brand: 'Dell', model: 'G15', storageGb: 1024 }],
  ['HP Omen 15 i7-10750H 16GB 512GB', { brand: 'HP', model: 'Omen 15' }],
  ['ASUS ExpertBook B1500 i5 8GB 256GB', { brand: 'ASUS', model: 'ExpertBook B1500', ramGb: 8, storageGb: 256 }],
];

describe('extractLaptopSpecs – popular used models', () => {
  it.each(popularUsed)('%s', (title, expected) => {
    expect(extractLaptopSpecs(title)).toMatchObject(expected);
  });
});
