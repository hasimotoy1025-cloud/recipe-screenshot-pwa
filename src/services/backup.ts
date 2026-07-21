import JSZip from 'jszip';
import { getAllData, getDB, saveSettings } from '../db';
import {
  APP_VERSION,
  type AppSettings,
  type BackupData,
  type BackupManifest,
  type ExperienceLog,
  type Ingredient,
  type Item,
  newId,
  type StoredImage
} from '../types';

export type RestoreMode = 'replace' | 'merge';

export async function createBackup(): Promise<{ blob: Blob; fileName: string }> {
  const { items, images, ingredients, experienceLogs, settings } = await getAllData();
  const createdAt = new Date().toISOString();
  const manifest: BackupManifest = {
    format: 'oishii-archive',
    version: 1,
    createdAt,
    appVersion: APP_VERSION,
    counts: {
      items: items.length,
      images: images.length,
      ingredients: ingredients.length,
      logs: experienceLogs.length
    }
  };
  const zip = new JSZip();
  const imageMetadata: BackupData['images'] = [];
  for (const image of images) {
    const extension = extensionFor(image.mimeType);
    const filePath = `images/${image.id}.${extension}`;
    zip.file(filePath, image.blob);
    const { blob: _blob, ...metadata } = image;
    void _blob;
    imageMetadata.push({ ...metadata, filePath });
  }
  const data: BackupData = {
    manifest,
    items,
    images: imageMetadata,
    ingredients,
    experienceLogs,
    settings: { ...settings, lastBackupAt: createdAt }
  };
  zip.file('backup.json', JSON.stringify(data, null, 2));
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  await saveSettings({ ...settings, lastBackupAt: createdAt });
  return { blob, fileName: `oishii-backup-${createdAt.slice(0, 10)}.zip` };
}

export async function inspectBackup(file: File | Blob): Promise<BackupData> {
  if (file.size > 1024 * 1024 * 1024) throw new Error('バックアップが大きすぎます（上限1GB）。');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('ZIPファイルを開けません。ファイルが壊れている可能性があります。');
  }
  const jsonEntry = zip.file('backup.json');
  if (!jsonEntry) throw new Error('このファイルには backup.json がありません。');
  let data: unknown;
  try {
    data = JSON.parse(await jsonEntry.async('text'));
  } catch {
    throw new Error('バックアップのJSONを読み取れません。');
  }
  assertBackupData(data);
  for (const image of data.images) {
    if (!zip.file(image.filePath))
      throw new Error(`画像ファイルが不足しています: ${image.filePath}`);
  }
  return data;
}

export async function restoreBackup(file: File | Blob, mode: RestoreMode): Promise<BackupData> {
  const data = await inspectBackup(file);
  const zip = await JSZip.loadAsync(file);
  const images: StoredImage[] = [];
  for (const metadata of data.images) {
    const entry = zip.file(metadata.filePath)!;
    const bytes = await entry.async('arraybuffer');
    const blob = new Blob([bytes], { type: metadata.mimeType });
    const { filePath: _filePath, ...record } = metadata;
    void _filePath;
    images.push({ ...record, blob });
  }
  await writeRestoredData(data, images, mode);
  return data;
}

export function assertBackupData(value: unknown): asserts value is BackupData {
  if (!value || typeof value !== 'object') throw new Error('バックアップ形式が不正です。');
  const data = value as Partial<BackupData>;
  if (data.manifest?.format !== 'oishii-archive')
    throw new Error('対応していないバックアップです。');
  if (data.manifest.version !== 1) {
    throw new Error(
      `バックアップのバージョン ${String(data.manifest.version)} には対応していません。`
    );
  }
  if (!Array.isArray(data.items)) throw new Error('バックアップの items が不正です。');
  if (!Array.isArray(data.images)) throw new Error('バックアップの images が不正です。');
  if (!Array.isArray(data.ingredients)) throw new Error('バックアップの ingredients が不正です。');
  if (!Array.isArray(data.experienceLogs))
    throw new Error('バックアップの experienceLogs が不正です。');
  const expectedCounts = data.manifest.counts;
  if (
    !expectedCounts ||
    expectedCounts.items !== data.items.length ||
    expectedCounts.images !== data.images.length ||
    expectedCounts.ingredients !== data.ingredients.length ||
    expectedCounts.logs !== data.experienceLogs.length
  ) {
    throw new Error('バックアップの件数情報とデータ内容が一致しません。');
  }
  if (!data.settings || typeof data.settings !== 'object')
    throw new Error('設定データが不正です。');
  const itemIds = new Set((data.items ?? []).map((item) => item.id));
  for (const record of [
    ...(data.images ?? []),
    ...(data.ingredients ?? []),
    ...(data.experienceLogs ?? [])
  ]) {
    if (!itemIds.has(record.itemId)) throw new Error('関連先のないデータが含まれています。');
  }
}

async function writeRestoredData(
  data: BackupData,
  sourceImages: StoredImage[],
  mode: RestoreMode
): Promise<void> {
  const db = await getDB();
  const transaction = db.transaction(
    ['items', 'images', 'ingredients', 'experienceLogs', 'settings'],
    'readwrite'
  );
  if (mode === 'replace') {
    await Promise.all([
      transaction.objectStore('items').clear(),
      transaction.objectStore('images').clear(),
      transaction.objectStore('ingredients').clear(),
      transaction.objectStore('experienceLogs').clear()
    ]);
  }

  const existing = {
    items: new Set(await transaction.objectStore('items').getAllKeys()),
    images: new Set(await transaction.objectStore('images').getAllKeys()),
    ingredients: new Set(await transaction.objectStore('ingredients').getAllKeys()),
    logs: new Set(await transaction.objectStore('experienceLogs').getAllKeys())
  };
  const itemIdMap = new Map<string, string>();
  const items = data.items.map((item): Item => {
    const id = mode === 'merge' && existing.items.has(item.id) ? newId() : item.id;
    itemIdMap.set(item.id, id);
    return {
      ...item,
      id,
      updatedAt: mode === 'merge' && id !== item.id ? new Date().toISOString() : item.updatedAt
    };
  });
  const images = sourceImages.map((image): StoredImage => ({
    ...image,
    id: mode === 'merge' && existing.images.has(image.id) ? newId() : image.id,
    itemId: itemIdMap.get(image.itemId) ?? image.itemId
  }));
  const ingredients = data.ingredients.map((ingredient): Ingredient => ({
    ...ingredient,
    id: mode === 'merge' && existing.ingredients.has(ingredient.id) ? newId() : ingredient.id,
    itemId: itemIdMap.get(ingredient.itemId) ?? ingredient.itemId
  }));
  const logs = data.experienceLogs.map((log): ExperienceLog => ({
    ...log,
    id: mode === 'merge' && existing.logs.has(log.id) ? newId() : log.id,
    itemId: itemIdMap.get(log.itemId) ?? log.itemId
  }));

  await Promise.all(items.map((record) => transaction.objectStore('items').put(record)));
  await Promise.all(images.map((record) => transaction.objectStore('images').put(record)));
  await Promise.all(
    ingredients.map((record) => transaction.objectStore('ingredients').put(record))
  );
  await Promise.all(logs.map((record) => transaction.objectStore('experienceLogs').put(record)));
  const restoredSettings: AppSettings = {
    ...data.settings,
    lastBackupAt: data.manifest.createdAt
  };
  await transaction.objectStore('settings').put(restoredSettings, 'app-settings');
  await transaction.done;
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
