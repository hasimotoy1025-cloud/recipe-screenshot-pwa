import { describe, expect, it } from 'vitest';
import { extractIngredients, normalizeOcrText, parseIngredientLine } from './ingredientParser';

describe('parseIngredientLine', () => {
  it.each([
    ['鶏もも肉 300g', '鶏もも肉', '300', 'g'],
    ['豚こま切れ肉 200 g', '豚こま切れ肉', '200', 'g'],
    ['しょうゆ 大さじ2', 'しょうゆ', '2', '大さじ'],
    ['酒 大さじ 1', '酒', '1', '大さじ'],
    ['砂糖 小さじ1/2', '砂糖', '1/2', '小さじ'],
    ['玉ねぎ 1/2個', '玉ねぎ', '1/2', '個'],
    ['にんにく 1片', 'にんにく', '1', '片'],
    ['水 100〜150ml', '水', '100〜150', 'ml'],
    ['塩 少々', '塩', '', '少々'],
    ['サラダ油 適量', 'サラダ油', '', '適量'],
    ['こしょう お好みで', 'こしょう', '', 'お好みで'],
    ['卵 2個', '卵', '2', '個'],
    ['米 2合', '米', '2', '合'],
    ['牛乳 約200ml', '牛乳', '約200', 'ml'],
    ['だし 2.5カップ', 'だし', '2.5', 'カップ'],
    ['酢 100～150ml', '酢', '100～150', 'ml'],
    ['水 ½カップ', '水', '1/2', 'カップ'],
    ['薄力粉 100程度', '薄力粉', '100程度', '']
  ])('%s を分解する', (line, name, quantity, unit) => {
    const result = parseIngredientLine(line);
    expect(result).toMatchObject({ name, quantity, unit });
  });

  it('材料ではない見出しを除外する', () => {
    expect(parseIngredientLine('材料')).toBeNull();
    expect(parseIngredientLine('作り方')).toBeNull();
  });
});

describe('extractIngredients', () => {
  it('行頭と括弧の材料グループを保持する', () => {
    const result = extractIngredients('A 醤油 大さじ2\n【たれ】みりん 大さじ1');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      groupName: 'A',
      name: '醤油',
      quantity: '2',
      unit: '大さじ'
    });
    expect(result[1]).toMatchObject({
      groupName: 'たれ',
      name: 'みりん',
      quantity: '1',
      unit: '大さじ'
    });
  });

  it('材料名と分量の間の改行を結合する', () => {
    const result = extractIngredients('鶏もも肉\n300g\n玉ねぎ\n1/2個');
    expect(result.map(({ name, quantity, unit }) => ({ name, quantity, unit }))).toEqual([
      { name: '鶏もも肉', quantity: '300', unit: 'g' },
      { name: '玉ねぎ', quantity: '1/2', unit: '個' }
    ]);
  });

  it('OCRの代表的な誤読を安全な範囲で補正する', () => {
    const result = extractIngredients('薄力粉 l00g\n水 100m1\n砂糖 小きじ1\nしょうゆ 大さじ7');
    expect(result[0]).toMatchObject({ name: '薄力粉', quantity: '100', unit: 'g' });
    expect(result[1]).toMatchObject({ name: '水', quantity: '100', unit: 'ml' });
    expect(result[2]).toMatchObject({ name: '砂糖', quantity: '1', unit: '小さじ' });
    expect(result[3]).toMatchObject({ name: 'しょうゆ', quantity: '7', unit: '大さじ' });
  });

  it('大さじ7のような曖昧な数字は勝手に1へ変更しない', () => {
    expect(normalizeOcrText('しょうゆ 大さじ7')).toBe('しょうゆ 大さじ7');
  });
});
