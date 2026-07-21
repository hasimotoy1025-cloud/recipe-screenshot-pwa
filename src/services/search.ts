import MiniSearch from 'minisearch';
import type { ItemSummary } from '../types';
import { formatIngredientAmount } from './ingredient';

interface SearchDocument {
  id: string;
  text: string;
}

export function searchItems(items: ItemSummary[], query: string): ItemSummary[] {
  const normalized = normalize(query);
  if (!normalized) return items;
  const documents = items.map((item) => ({ id: item.id, text: buildSearchText(item) }));
  const exactMatches = new Set(
    documents
      .filter((document) => normalize(document.text).includes(normalized))
      .map((document) => document.id)
  );
  const miniSearch = new MiniSearch<SearchDocument>({
    fields: ['text'],
    storeFields: [],
    tokenize: tokenizeForJapanese,
    processTerm: normalize
  });
  miniSearch.addAll(documents);
  const resultIds = new Set(
    miniSearch
      .search(normalized, { prefix: true, fuzzy: normalized.length >= 4 ? 0.2 : false })
      .map((r) => r.id)
  );
  return items.filter((item) => exactMatches.has(item.id) || resultIds.has(item.id));
}

function buildSearchText(item: ItemSummary): string {
  return [
    item.title,
    item.sourceName,
    item.memo,
    item.ocrText,
    item.tags.join(' '),
    item.ingredients
      .map(
        (ingredient) =>
          `${ingredient.name} ${formatIngredientAmount(ingredient.quantity, ingredient.unit)}`
      )
      .join(' '),
    item.logs.map((log) => `${log.comment} ${log.improvementNote}`).join(' ')
  ].join(' ');
}

function tokenizeForJapanese(text: string): string[] {
  const value = normalize(text);
  const tokens = value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const ngrams: string[] = [];
  for (const token of tokens) {
    ngrams.push(token);
    if ([...token].every((character) => (character.codePointAt(0) ?? 0) <= 0x7f)) continue;
    for (let size = 1; size <= Math.min(3, token.length); size += 1) {
      for (let index = 0; index <= token.length - size; index += 1) {
        ngrams.push(token.slice(index, index + size));
      }
    }
  }
  return [...new Set(ngrams)];
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s+/g, ' ').trim();
}
