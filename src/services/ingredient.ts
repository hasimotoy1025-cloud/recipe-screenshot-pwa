import type { Ingredient } from '../types';

const UNIT_BEFORE_QUANTITY = new Set(['大さじ', '小さじ', 'カップ']);

export function formatIngredientAmount(quantity: string, unit: string): string {
  const displayQuantity = quantity.trim();
  const displayUnit = unit.trim();
  if (!displayQuantity) return displayUnit;
  if (!displayUnit) return displayQuantity;
  return UNIT_BEFORE_QUANTITY.has(displayUnit)
    ? `${displayUnit}${displayQuantity}`
    : `${displayQuantity}${displayUnit}`;
}

export function normalizeIngredientName(rawName: string): string {
  return rawName.replace(/^[\s.…・･:：、。\-–—]+|[\s.…・･:：、。\-–—]+$/gu, '');
}

export function prepareIngredientForSave(ingredient: Ingredient): Ingredient {
  return {
    ...ingredient,
    name: normalizeIngredientName(ingredient.name),
    // quantityは計算・分解・正規化せず、ユーザーが入力した文字列をそのまま保持する。
    quantity: ingredient.quantity,
    unit: ingredient.unit
  };
}
