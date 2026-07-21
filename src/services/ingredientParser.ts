import type { Ingredient, OcrLineResult } from '../types';
import { newId } from '../types';
import { normalizeIngredientName } from './ingredient';
import { OCR_LINE_REVIEW_THRESHOLD } from './ocrPreprocess';

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
  '合',
  '振り'
];
const GROUP_NAMES = ['たれ', '衣', '下味', 'トッピング'];
const quantityCore = String.raw`(?:\d+\s*と\s*\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:[〜～~-]\d+(?:\.\d+)?)?|[½⅓⅔¼¾])`;
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
    .replace(/：/g, '\uE000')
    .normalize('NFKC')
    .replace(/\uE000/g, '：')
    .replace(/⁄/g, '/')
    .replace(/~/g, '～')
    .replace(
      /(^|\s)[lI](?=\d{2,}\s*(?:g|kg|ml|mL|cc|L)\b)/g,
      (_match, space: string) => `${space}1`
    )
    .replace(/(\d)\s*m1\b/gi, '$1ml')
    .replace(/小きじ/g, '小さじ')
    .replace(/(^|\n)\s*(?:[•●▪・]\uFE0E?)\s*/g, '$1')
    .replace(/[\t\u3000]+/g, ' ')
    .replace(/\r/g, '');
}

export function extractIngredients(
  text: string,
  itemId = '',
  lineResults: OcrLineResult[] = []
): Ingredient[] {
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
    const sourceConfidence = findSourceConfidence(parsed.sourceLine, lineResults);
    const suspicious = isSuspiciousIngredientName(parsed.name);
    ingredients.push({
      id: newId(),
      itemId,
      ...parsed,
      sortOrder: ingredients.length,
      included: !suspicious,
      needsReview: needsIngredientReview(parsed.name, sourceConfidence),
      sourceConfidence
    });
  }
  return ingredients;
}

export function isSuspiciousIngredientName(name: string): boolean {
  const compactName = name.replace(/\s/g, '');
  const japaneseCount = (
    compactName.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu) ?? []
  ).length;
  const latinDigitSymbolCount = (compactName.match(/[A-Za-z0-9_\-–—]/g) ?? []).length;
  const meaningfulCount = japaneseCount + latinDigitSymbolCount;
  if (latinDigitSymbolCount < 3 || meaningfulCount === 0) return false;
  return japaneseCount === 0 || japaneseCount / meaningfulCount < 0.25;
}

export function needsIngredientReview(name: string, confidence?: number): boolean {
  return (
    isSuspiciousIngredientName(name) ||
    (confidence !== undefined && confidence < OCR_LINE_REVIEW_THRESHOLD)
  );
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
  return normalizeIngredientName(value);
}

function cleanNote(value: string): string {
  return value.replace(/^[\s(（]+|[\s)）]+$/g, '').trim();
}

function compact(value: string): string {
  return value.replace(/\s+/g, '');
}

function findSourceConfidence(sourceLine: string, results: OcrLineResult[]): number | undefined {
  const normalizedSource = normalizeOcrText(sourceLine).replace(/\s+/g, ' ').trim();
  const matches = results.filter((result) => {
    const normalizedResult = normalizeOcrText(result.text).replace(/\s+/g, ' ').trim();
    return (
      normalizedResult === normalizedSource ||
      normalizedSource.includes(normalizedResult) ||
      normalizedResult.includes(normalizedSource)
    );
  });
  if (!matches.length) return undefined;
  return Math.min(...matches.map((result) => result.confidence));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
