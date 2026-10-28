import { describe, expect, it } from 'vitest';
import { detectDefects } from './defects';

describe('detectDefects', () => {
  const positive: Array<[string, string]> = [
    ['Ноутбук Lenovo G580 на запчастини', 'parts'],
    ['HP 250 G6 на запчасти', 'parts'],
    ['Asus X540 на з/ч', 'parts'],
    ['Dell Inspiron 15 донор', 'parts'],
    ['MacBook Air for parts', 'parts'],
    ['Acer Aspire не включается', 'not_working'],
    ['Lenovo IdeaPad не вмикається', 'not_working'],
    ['HP ProBook не працює', 'not_working'],
    ['Ноутбук Asus битая матрица', 'broken'],
    ['Lenovo T480 розбитий екран', 'broken'],
    ['Dell Latitude тріщина на корпусі', 'broken'],
    ['HP EliteBook без матриці', 'missing_part'],
    ['Acer Nitro 5 без SSD и без зарядки', 'missing_part'],
    ['ThinkPad X1 BIOS password', 'locked'],
    ['MacBook Pro iCloud заблокирован', 'locked'],
    ['Asus Zenbook залитий', 'liquid'],
    ['Ноутбук после воды', 'liquid'],
  ];
  it.each(positive)('flags %s', (title, tag) => {
    expect(detectDefects(title)).toContain(tag);
  });

  const negative = [
    'Lenovo ThinkPad T480 i5 16/512 без дефектів',
    'Dell Latitude 5490 не бита, не крашена',
    'HP ProBook 450 G5 без недоліків, з зарядкою',
    'Asus VivoBook 15 в ідеальному стані',
    'MacBook Air M1 8/256 не залитий',
    'Acer Swift 3 без нюансов',
  ];
  it.each(negative)('does not flag %s', (title) => {
    expect(detectDefects(title)).toEqual([]);
  });

  it('reads the description too', () => {
    expect(detectDefects('Lenovo IdeaPad 330', 'Продаю, не запускается, на запчасти')).toEqual(['parts', 'not_working']);
  });
});
