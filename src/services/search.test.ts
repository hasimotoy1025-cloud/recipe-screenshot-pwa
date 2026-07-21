import { describe, expect, it } from 'vitest';
import { searchItems } from './search';
import type { ItemSummary } from '../types';

const base: ItemSummary = {
  id: '1',
  itemType: 'recipe',
  title: '親子丼',
  sourceUrl: '',
  sourceName: '料理帳',
  status: 'saved',
  memo: '平日の夕食',
  ocrText: '',
  tags: ['和食'],
  createdAt: '',
  updatedAt: '',
  ingredients: [
    {
      id: 'i',
      itemId: '1',
      name: '鶏もも肉',
      quantity: '300',
      unit: 'g',
      note: '',
      groupName: '',
      sortOrder: 0,
      included: true,
      sourceLine: ''
    }
  ],
  logs: [],
  latestRating: null,
  wouldRepeat: null
};

describe('searchItems', () => {
  it('日本語の部分一致でタイトルを検索する', () => {
    expect(searchItems([base], '子丼')).toHaveLength(1);
  });

  it('材料名を検索する', () => {
    expect(searchItems([base], 'もも肉')).toHaveLength(1);
  });

  it('表示順で整形した材料分量を検索する', () => {
    const item = {
      ...base,
      ingredients: [{ ...base.ingredients[0]!, quantity: '2', unit: '大さじ' }]
    };
    expect(searchItems([item], '大さじ2')).toHaveLength(1);
  });

  it('一致しない語を除外する', () => {
    expect(searchItems([base], 'パスタ')).toHaveLength(0);
  });
});
