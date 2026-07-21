import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../types';
import {
  formatIngredientAmount,
  normalizeIngredientName,
  prepareIngredientForSave
} from './ingredient';

describe('formatIngredientAmount', () => {
  it.each([
    ['2', '大さじ', '大さじ2'],
    ['1/2', '小さじ', '小さじ1/2'],
    ['2と2/3', '小さじ', '小さじ2と2/3'],
    ['1', 'カップ', 'カップ1'],
    ['140', 'g', '140g'],
    ['8', '振り', '8振り'],
    ['', '適量', '適量'],
    ['', '少々', '少々'],
    ['', 'ひとつまみ', 'ひとつまみ'],
    ['3', '未知単位', '3未知単位']
  ])('quantity=%s unit=%s を「%s」と表示する', (quantity, unit, expected) => {
    expect(formatIngredientAmount(quantity, unit)).toBe(expected);
  });
});

describe('normalizeIngredientName', () => {
  it.each([
    ['マルタイ棒ラーメン...', 'マルタイ棒ラーメン'],
    ['豚バラ肉……', '豚バラ肉'],
    [' キャベツ.... ', 'キャベツ'],
    ['ウスターソース・・・', 'ウスターソース'],
    ['塩・こしょう', '塩・こしょう'],
    ['オリーブオイル（炒め用）', 'オリーブオイル（炒め用）'],
    ['A：しょうゆ', 'A：しょうゆ']
  ])('「%s」を「%s」へ正規化する', (input, expected) => {
    expect(normalizeIngredientName(input)).toBe(expected);
  });
});

describe('prepareIngredientForSave', () => {
  const base: Ingredient = {
    id: 'ingredient-1',
    itemId: 'item-1',
    name: ' 中華あじ… ',
    quantity: '2と2/3',
    unit: '小さじ',
    note: '',
    groupName: '',
    sortOrder: 0,
    included: true,
    sourceLine: ''
  };

  it.each(['1/2', '1/3', '2/3', '2と2/3', '1と1/2', '100〜150', '約200'])(
    '数量「%s」を変形せず保存対象へ渡す',
    (quantity) => {
      const saved = prepareIngredientForSave({ ...base, quantity });
      expect(saved.quantity).toBe(quantity);
      expect(saved.unit).toBe('小さじ');
    }
  );

  it('材料名だけを正規化し、数量と単位を別フィールドのまま保持する', () => {
    expect(prepareIngredientForSave(base)).toMatchObject({
      name: '中華あじ',
      quantity: '2と2/3',
      unit: '小さじ'
    });
  });
});
