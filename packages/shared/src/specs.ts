import { trigramSimilarity } from './text';

/** FR-CMP-005 / FR-GRP-001 laptop spec extraction. */
export interface LaptopSpecs {
  brand: string | null;
  model: string | null;
  cpu: string | null;
  ramGb: number | null;
  storageGb: number | null;
  gpu: string | null;
  screenIn: number | null;
}

const BRAND_RULES: Array<{ re: RegExp; name: string }> = [
  { re: /\bmac\s?book\b/i, name: 'Apple' },
  { re: /\bapple\b/i, name: 'Apple' },
  { re: /\bthinkpad\b|\blenovo\b|\bideapad\b/i, name: 'Lenovo' },
  { re: /\blatitude\b|\binspiron\b|\bxps\b|\bvostro\b|\bprecision\b|\bdell\b/i, name: 'Dell' },
  { re: /\bprobook\b|\belitebook\b|\bpavilion\b|\bomnibook\b|\bhp\b/i, name: 'HP' },
  { re: /\basus\b|\bzenbook\b|\bvivobook\b|\btuf\b|\brog\b/i, name: 'ASUS' },
  { re: /\bacer\b|\baspire\b|\bnitro\b|\bpredator\b/i, name: 'Acer' },
  { re: /\bmsi\b/i, name: 'MSI' },
  { re: /\bhuawei\b|\bmatebook\b/i, name: 'Huawei' },
  { re: /\bsamsung\b|\bgalaxy book\b/i, name: 'Samsung' },
  { re: /\bgigabyte\b/i, name: 'Gigabyte' },
  { re: /\brazer\b/i, name: 'Razer' },
  { re: /\bmicrosoft\b|\bsurface\b/i, name: 'Microsoft' },
  { re: /\bxiaomi\b|\bredmibook\b/i, name: 'Xiaomi' },
  { re: /\bhonor\b|\bmagicbook\b/i, name: 'Honor' },
];

const MODEL_RES: RegExp[] = [
  /\blatitude\s+\d{3,4}\b/i,
  /\bxps\s+\d{2}\b/i,
  /\binspiron\s+\d{3,4}\b/i,
  /\bprecision\s+\d{3,4}\b/i,
  /\bvostro\s+\d{3,4}\b/i,
  /\bthinkpad\s+[a-z]\d{2,3}[a-z]?(?:\s+gen\s*\d)?/i,
  /\bideapad\s+[a-z]?\d{2,3}\b/i,
  /\bmacbook\s+(?:pro|air)(?:\s+\d{2})?/i,
  /\bprobook\s+\d{3}(?:\s*g\d)?/i,
  /\belitebook\s+\d{3}(?:\s*g\d)?/i,
  /\bpavilion\s+\d{2}\b/i,
  /\bnitro\s+\d\b/i,
  /\baspire\s+\d\b/i,
  /\bpredator\s+\w+\b/i,
  /\btuf\s+[a-z]?\d{2}\b/i,
  /\brog\s+[a-z]+\s*\d*/i,
  /\bvivobook\s+\d{2}\b/i,
  /\bzenbook\s+[a-z0-9]+\b/i,
  /\bmatebook\s+[a-z]\s*\d{2}\b/i,
  /\bsurface\s+(?:laptop|pro)(?:\s*\d)?/i,
  /\bmagicbook\s+\w+/i,
  /\bredmibook\s+\d+/i,
];

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function titleCaseModel(value: string): string {
  return clean(value)
    .split(' ')
    .map((part) => {
      if (/^g\d$/i.test(part)) return part.toUpperCase();
      if (/^[a-z]\d/i.test(part)) return part.toUpperCase();
      if (/^(pro|air|gen)$/i.test(part)) return part[0]!.toUpperCase() + part.slice(1).toLowerCase();
      if (/^(tuf|rog|hp|msi|rx|rtx|gtx)$/i.test(part)) return part.toUpperCase();
      if (part.length <= 3 && /^[a-z]+$/i.test(part)) {
        return part.toUpperCase();
      }
      return part[0]!.toUpperCase() + part.slice(1);
    })
    .join(' ')
    .replace(/\bMacbook\b/i, 'MacBook')
    .replace(/\bThinkpad\b/i, 'ThinkPad')
    .replace(/\bIdeapad\b/i, 'IdeaPad')
    .replace(/\bElitebook\b/i, 'EliteBook')
    .replace(/\bProbook\b/i, 'ProBook')
    .replace(/\bVivobook\b/i, 'VivoBook')
    .replace(/\bZenbook\b/i, 'ZenBook')
    .replace(/\bMatebook\b/i, 'MateBook')
    .replace(/\bMagicbook\b/i, 'MagicBook')
    .replace(/\bRedmibook\b/i, 'RedmiBook');
}

export function extractLaptopSpecs(title: string, description = ''): LaptopSpecs {
  const text = `${title} ${description}`.replace(/[“”«»]/g, ' ');
  const brand = BRAND_RULES.find((rule) => rule.re.test(text))?.name ?? null;
  const modelRaw = MODEL_RES.map((re) => text.match(re)?.[0]).find(Boolean) ?? null;
  const model = modelRaw ? titleCaseModel(modelRaw) : null;

  let cpu: string | null = null;
  const intel = text.match(/\b(i[3579])[\s-]?(\d{4,5}[a-z0-9]{0,4})\b/i);
  const ryzen = text.match(/\bryzen\s*([3579])\s*(\d{4}[a-z]{0,3})\b/i);
  const ultra = text.match(/\bcore\s*ultra\s*([579])\s*(\d{3}[a-z]*)\b/i);
  const apple = text.match(/\b(m[1-4])(?:\s*(pro|max))?\b/i);
  if (intel) cpu = `${intel[1]!.toLowerCase()}-${intel[2]!.toUpperCase()}`;
  else if (ryzen) cpu = `Ryzen ${ryzen[1]} ${ryzen[2]!.toUpperCase()}`;
  else if (ultra) cpu = `Core Ultra ${ultra[1]} ${ultra[2]!.toUpperCase()}`;
  else if (apple && brand === 'Apple') cpu = apple[2] ? `${apple[1]!.toUpperCase()} ${apple[2]![0]!.toUpperCase()}${apple[2]!.slice(1).toLowerCase()}` : apple[1]!.toUpperCase();

  const ramGb = pickRam(text);
  const storageGb = pickStorage(text, ramGb);
  const gpu = pickGpu(text);
  const screen = text.match(/(\d{2}(?:[.,]\d)?)\s*(?:"|”|дюйм|inch|\bin\b)/i);
  const screenIn = screen ? Number(screen[1]!.replace(',', '.')) : null;

  return { brand, model, cpu, ramGb, storageGb, gpu, screenIn };
}

function pickRam(text: string): number | null {
  const labeled = text.match(/(\d{1,3})\s*(?:gb|гб)\s*(?:ram|ddr\d?|озу|озп)/i) ?? text.match(/(?:ram|озу|озп|ddr\d)\s*[:\s]*(\d{1,3})\s*(?:gb|гб)?/i);
  if (labeled) return Number(labeled[1]);
  const pair = text.match(/\b(\d{1,2})\s*\/\s*(\d{2,4})\b/);
  if (pair && Number(pair[1]) <= 64 && Number(pair[2]) >= 128) return Number(pair[1]);
  const values = [...text.matchAll(/(\d{1,3})\s*(?:gb|гб)/gi)].map((m) => Number(m[1]));
  const small = values.find((n) => n >= 4 && n <= 64);
  const large = values.find((n) => n >= 128);
  if (small && large) return small;
  return null;
}

function pickStorage(text: string, ram: number | null): number | null {
  const tb = text.match(/(\d(?:[.,]\d)?)\s*(?:tb|тб)/i);
  if (tb) return Math.round(Number(tb[1]!.replace(',', '.')) * 1024);
  const labeled = text.match(/(\d{2,4})\s*(?:gb|гб)\s*(?:ssd|hdd|nvme)/i);
  if (labeled) return Number(labeled[1]);
  const pair = text.match(/\b(\d{1,2})\s*\/\s*(\d{2,4})\b/);
  if (pair && Number(pair[2]) >= 128) return Number(pair[2]);
  const values = [...text.matchAll(/(\d{2,4})\s*(?:gb|гб)/gi)].map((m) => Number(m[1]));
  const storage = values.find((n) => n >= 128 && n !== ram);
  return storage ?? null;
}

function pickGpu(text: string): string | null {
  const nvidia = text.match(/\b(rtx|gtx)\s*(\d{3,4})\s*(ti|super)?/i);
  if (nvidia) {
    return `${nvidia[1]!.toUpperCase()} ${nvidia[2]}${nvidia[3] ? ` ${nvidia[3].toUpperCase()}` : ''}`;
  }
  const amd = text.match(/\brx\s*(\d{4})\b/i);
  if (amd) return `RX ${amd[1]}`;
  if (/iris\s*xe/i.test(text)) return 'Iris Xe';
  if (/\buhd\b/i.test(text)) return 'UHD';
  return null;
}

export function groupKeyFromSpecs(specs: LaptopSpecs): string | null {
  if (!specs.brand || !specs.model) return null;
  return [specs.brand, specs.model, specs.cpu ?? '', specs.ramGb ?? '', specs.storageGb ?? '']
    .join('|')
    .toLowerCase();
}

export function displayGroupName(specs: LaptopSpecs): string {
  return [specs.brand, specs.model, specs.cpu, specs.ramGb ? `${specs.ramGb}GB` : null, specs.storageGb ? `${specs.storageGb}GB` : null]
    .filter(Boolean)
    .join(' / ');
}

export function specsCompatible(a: LaptopSpecs, b: LaptopSpecs): boolean {
  if (!a.brand || !b.brand || a.brand !== b.brand) return false;
  if (!a.model || !b.model) return false;
  const sameModel =
    a.model.toLowerCase() === b.model.toLowerCase() || trigramSimilarity(a.model, b.model) >= 0.86;
  if (!sameModel) return false;
  if (a.ramGb && b.ramGb && a.ramGb !== b.ramGb) return false;
  if (a.storageGb && b.storageGb && a.storageGb !== b.storageGb) return false;
  if (a.cpu && b.cpu && a.cpu.toLowerCase() !== b.cpu.toLowerCase()) return false;
  return true;
}

export function specConfidence(specs: LaptopSpecs): number {
  let score = 0;
  if (specs.brand) score += 0.2;
  if (specs.model) score += 0.4;
  if (specs.cpu) score += 0.15;
  if (specs.ramGb) score += 0.1;
  if (specs.storageGb) score += 0.1;
  if (specs.gpu) score += 0.05;
  return Math.min(1, score);
}
