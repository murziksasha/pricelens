/**
 * Defect and "for parts" detection for used-laptop titles and descriptions (uk/ru/en).
 * Defective listings are left out of working-unit medians and get their own "for parts" range.
 */
export type DefectTag = 'parts' | 'not_working' | 'broken' | 'missing_part' | 'locked' | 'liquid';

const RULES: Array<[DefectTag, RegExp]> = [
  ['parts', /на\s*запчаст|на\s*з\s*\/\s*ч|на\s*детал|for\s*parts|parts\s*only|донор/i],
  ['not_working', /не\s*(включа|вмика|увімкн|запуска|працю|работа|грузит|завантаж)/i],
  ['broken', /(?<![\p{L}])(бит(ый|ая|а|ий)|розбит|разбит|тріщин|трещин|cracked|broken|зламан|сломан)/iu],
  ['missing_part', /(?<![\p{L}])без\s*(матриц|экран|екран|жестк|диск|ssd|hdd|ram|оперативк|зарядк|акб|батаре|клавіатур|клавиатур)/iu],
  ['locked', /bios\s*(pass|парол)|запаролен|icloud|\bmdm\b|заблок/i],
  ['liquid', /залит|після\s*вод|после\s*вод|liquid\s*damage/i],
];

/** Phrases that say the opposite ("без дефектів", "не бита") and must not count. */
const NEGATIONS = /без\s*(дефект|недолік|недостат|нюанс|проблем)|не\s*(бит|бита|битый|розбит|разбит|залит)|не\s*был\s*в\s*ремонт/gi;

export function detectDefects(title: string, description?: string | null): DefectTag[] {
  const text = `${title} ${description ?? ''}`.replace(NEGATIONS, ' ');
  return RULES.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}
