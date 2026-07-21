import { describe, expect, it } from 'vitest';
import {
  extractIngredients,
  isSuspiciousIngredientName,
  needsIngredientReview,
  normalizeOcrText,
  parseIngredientLine
} from './ingredientParser';

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
    ['薄力粉 100程度', '薄力粉', '100程度', ''],
    ['中華あじ 小さじ2と2/3', '中華あじ', '2と2/3', '小さじ'],
    ['中華あじ 2と2/3 小さじ', '中華あじ', '2と2/3', '小さじ'],
    ['ごま 8振り', 'ごま', '8', '振り']
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

  it.each([
    ['マルタイ棒ラーメン... 140g', 'マルタイ棒ラーメン'],
    ['豚バラ肉…… 140g', '豚バラ肉'],
    ['キャベツ.... 160g', 'キャベツ'],
    ['中華あじ… 小さじ2', '中華あじ'],
    ['ウスターソース・・・ 大さじ1', 'ウスターソース'],
    ['塩・こしょう 適量', '塩・こしょう'],
    ['A：しょうゆ 大さじ1', 'A：しょうゆ']
  ])('OCR材料名「%s」の端だけを正規化する', (line, expectedName) => {
    expect(parseIngredientLine(line)?.name).toBe(expectedName);
  });

  it('信頼度が低いOCR行から抽出した材料を要確認にする', () => {
    const result = extractIngredients('ラード 大さじ2', 'item-1', [
      { text: 'ラード 大さじ2', confidence: 54 }
    ]);
    expect(result[0]).toMatchObject({
      name: 'ラード',
      included: true,
      needsReview: true,
      sourceConfidence: 54
    });
  });

  it.each(['S—R_KS52', 'WRY—Y—R_KEL1'])(
    '記号・英数字中心の候補「%s」を要確認かつ保存対象外にする',
    (line) => {
      const result = extractIngredients(line);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ included: false, needsReview: true });
      expect(isSuspiciousIngredientName(result[0]?.name ?? '')).toBe(true);
    }
  );

  it('日本語中心の材料名を記号・英数字中心と誤判定しない', () => {
    expect(isSuspiciousIngredientName('マルタイ棒ラーメン')).toBe(false);
    expect(needsIngredientReview('豚バラ肉', 88)).toBe(false);
  });

  it('行信頼度70%未満だけを低信頼度として判定する', () => {
    expect(needsIngredientReview('ラード', 69.9)).toBe(true);
    expect(needsIngredientReview('ラード', 70)).toBe(false);
  });
});
