import type { Ingredient } from '../types';
import { newId } from '../types';

const SPECIAL_UNITS = ['お好みで', 'ひとつまみ', '適量', '少々', '適宜'];
const MEASURE_UNITS = [
  '大さじ',
  '小さじ',
  'カップ',
  'パック',
  'kg',
  'ml',
  'mL',
  'cc',
  'g',
  'L',
  '個',
  '本',
  '枚',
  '玉',
  '片',
  '袋',
  '缶',
  '束',
  '房',
  '丁',
  '合'
];
const GROUP_NAMES = ['たれ', '衣', '下味', 'トッピング'];
const quantityCore = String.raw`(?:\d+\/\d+|\d+(?:\.\d+)?(?:[〜～~-]\d+(?:\.\d+)?)?|[½⅓⅔¼¾])`;
const unitPattern = MEASURE_UNITS.sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

export interface ParsedIngredient {
  name: string;
  quantity: string;
  unit: string;
  note: string;
  groupName: string;
  sourceLine: string;
}

export function normalizeOcrText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/⁄/g, '/')
    .replace(/~/g, '～')
    .replace(
      /(^|\s)[lI](?=\d{2,}\s*(?:g|kg|ml|mL|cc|L)\b)/g,
      (_match, space: string) => `${space}1`
    )
    .replace(/(\d)\s*m1\b/gi, '$1ml')
    .replace(/小きじ/g, '小さじ')
    .replace(/(?:[•●▪・]\uFE0E?)\s*/g, '')
    .replace(/[\t\u3000]+/g, ' ')
    .replace(/\r/g, '');
}

export function extractIngredients(text: string, itemId = ''): Ingredient[] {
  const lines = joinWrappedAmountLines(
    normalizeOcrText(text)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const ingredients: Ingredient[] = [];
  let activeGroup = '';

  for (const originalLine of lines) {
    const header = detectGroupHeader(originalLine);
    if (header && !header.rest) {
      activeGroup = header.groupName;
      continue;
    }

    const groupName = header?.groupName ?? activeGroup;
    const line = header?.rest ?? originalLine;
    const parsed = parseIngredientLine(line, groupName, originalLine);
    if (!parsed) continue;
    ingredients.push({
      id: newId(),
      itemId,
      ...parsed,
      sortOrder: ingredients.length,
      included: true
    });
  }
  return ingredients;
}

export function parseIngredientLine(
  rawLine: string,
  groupName = '',
  sourceLine = rawLine
): ParsedIngredient | null {
  const line = normalizeOcrText(rawLine).trim();
  if (!line || /^(材料|作り方|手順|分量|ingredients?)\s*[:：]?$/i.test(line)) return null;

  const special = SPECIAL_UNITS.find((unit) => line.endsWith(unit));
  if (special) {
    const name = cleanName(line.slice(0, -special.length));
    if (!name) return null;
    return { name, quantity: '', unit: special, note: '', groupName, sourceLine };
  }

  const unitFirst = new RegExp(
    String.raw`^(.*?)\s*(大さじ|小さじ|カップ)\s*(約?\s*${quantityCore}(?:\s*程度)?)\s*(.*)$`,
    'i'
  ).exec(line);
  if (unitFirst) {
    const name = cleanName(unitFirst[1] ?? '');
    if (!name) return null;
    return {
      name,
      quantity: compact(unitFirst[3] ?? ''),
      unit: canonicalUnit(unitFirst[2] ?? ''),
      note: cleanNote(unitFirst[4] ?? ''),
      groupName,
      sourceLine
    };
  }

  const quantityFirst = new RegExp(
    String.raw`^(.*?)\s*(約?\s*${quantityCore}(?:\s*程度)?)\s*(${unitPattern})?\s*(.*)$`,
    'i'
  ).exec(line);
  if (quantityFirst) {
    const name = cleanName(quantityFirst[1] ?? '');
    if (!name) return null;
    const unit = canonicalUnit(quantityFirst[3] ?? '');
    const note = cleanNote(quantityFirst[4] ?? '');
    if (!unit && !/(?:約|程度)/.test(quantityFirst[2] ?? '') && note.length > 12) return null;
    return {
      name,
      quantity: compact(quantityFirst[2] ?? ''),
      unit,
      note,
      groupName,
      sourceLine
    };
  }
  return null;
}

function detectGroupHeader(line: string): { groupName: string; rest: string } | null {
  const bracket = /^(?:【([^】]+)】|\[([^\]]+)\]|［([^］]+)］)\s*(.*)$/.exec(line);
  if (bracket) {
    return {
      groupName: (bracket[1] ?? bracket[2] ?? bracket[3] ?? '').trim(),
      rest: (bracket[4] ?? '').trim()
    };
  }
  if (/^[AB]$/.test(line)) return { groupName: line, rest: '' };
  const prefixed = /^([AB])\s+(.+)$/.exec(line);
  if (prefixed && containsAmount(prefixed[2] ?? '')) {
    return { groupName: prefixed[1] ?? '', rest: prefixed[2] ?? '' };
  }
  if (GROUP_NAMES.includes(line.replace(/[：:]$/, ''))) {
    return { groupName: line.replace(/[：:]$/, ''), rest: '' };
  }
  return null;
}

function joinWrappedAmountLines(lines: string[]): string[] {
  const joined: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const next = lines[index + 1] ?? '';
    if (!parseIngredientLine(line) && startsWithAmount(next) && !detectGroupHeader(line)) {
      joined.push(`${line} ${next}`);
      index += 1;
    } else {
      joined.push(line);
    }
  }
  return joined;
}

function containsAmount(line: string): boolean {
  return parseIngredientLine(line) !== null;
}

function startsWithAmount(line: string): boolean {
  return new RegExp(
    String.raw`^(?:約?\s*${quantityCore}|大さじ|小さじ|カップ|${SPECIAL_UNITS.join('|')})`,
    'i'
  ).test(line);
}

function canonicalUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower === 'ml') return 'ml';
  if (lower === 'kg') return 'kg';
  if (lower === 'cc') return 'cc';
  if (lower === 'g') return 'g';
  if (unit === 'l' || unit === 'L') return 'L';
  return unit;
}

function cleanName(value: string): string {
  return value.replace(/^[\s:：\-–—]+|[\s:：\-–—]+$/g, '').trim();
}

function cleanNote(value: string): string {
  return value.replace(/^[\s(（]+|[\s)）]+$/g, '').trim();
}

function compact(value: string): string {
  return value.replace(/\s+/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
