import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, getItemBundle, saveItemBundle } from './db';
import type { Ingredient, ItemBundle } from './types';

const quantities = ['1/2', '1/3', '2/3', '2と2/3', '1と1/2', '100〜150', '約200'];

describe('IndexedDBの材料数量保存', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('文字列の数量を保存・再読込・再保存しても変形しない', async () => {
    const ingredients = quantities.map((quantity, sortOrder): Ingredient => ({
      id: `ingredient-${sortOrder}`,
      itemId: 'item-fraction-test',
      name: sortOrder === 3 ? '中華あじ' : `材料${sortOrder + 1}`,
      quantity,
      unit: sortOrder === 3 ? '小さじ' : 'g',
      note: '',
      groupName: '',
      sortOrder,
      included: true,
      sourceLine: ''
    }));
    const bundle: ItemBundle = {
      item: {
        id: 'item-fraction-test',
        itemType: 'recipe',
        title: '分数保存テスト',
        sourceUrl: '',
        sourceName: '',
        status: 'saved',
        memo: '',
        ocrText: '',
        tags: [],
        createdAt: '2026-07-21T00:00:00.000Z',
        updatedAt: '2026-07-21T00:00:00.000Z'
      },
      images: [],
      ingredients,
      logs: []
    };

    await saveItemBundle(bundle);
    const firstRead = await getItemBundle(bundle.item.id);
    expect(firstRead?.ingredients.map((ingredient) => ingredient.quantity)).toEqual(quantities);
    expect(firstRead?.ingredients[3]).toMatchObject({
      quantity: '2と2/3',
      unit: '小さじ'
    });

    await saveItemBundle({
      ...firstRead!,
      item: { ...firstRead!.item, updatedAt: '2026-07-21T01:00:00.000Z' }
    });
    const secondRead = await getItemBundle(bundle.item.id);
    expect(secondRead?.ingredients.map((ingredient) => ingredient.quantity)).toEqual(quantities);
    expect(secondRead?.ingredients[3]).toMatchObject({
      quantity: '2と2/3',
      unit: '小さじ'
    });
  });
});
