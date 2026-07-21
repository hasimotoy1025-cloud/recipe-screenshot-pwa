import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppSettings,
  ExperienceLog,
  Ingredient,
  Item,
  ItemBundle,
  StoredImage
} from './types';
import { DEFAULT_SETTINGS } from './types';

interface ArchiveDB extends DBSchema {
  items: {
    key: string;
    value: Item;
    indexes: { 'by-updated': string; 'by-type': string; 'by-status': string };
  };
  images: {
    key: string;
    value: StoredImage;
    indexes: { 'by-item': string };
  };
  ingredients: {
    key: string;
    value: Ingredient;
    indexes: { 'by-item': string; 'by-name': string };
  };
  experienceLogs: {
    key: string;
    value: ExperienceLog;
    indexes: { 'by-item': string; 'by-date': string };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<ArchiveDB>> | undefined;

export function getDB(): Promise<IDBPDatabase<ArchiveDB>> {
  dbPromise ??= openDB<ArchiveDB>('oishii-archive', 1, {
    upgrade(db) {
      const items = db.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('by-updated', 'updatedAt');
      items.createIndex('by-type', 'itemType');
      items.createIndex('by-status', 'status');

      const images = db.createObjectStore('images', { keyPath: 'id' });
      images.createIndex('by-item', 'itemId');

      const ingredients = db.createObjectStore('ingredients', { keyPath: 'id' });
      ingredients.createIndex('by-item', 'itemId');
      ingredients.createIndex('by-name', 'name');

      const logs = db.createObjectStore('experienceLogs', { keyPath: 'id' });
      logs.createIndex('by-item', 'itemId');
      logs.createIndex('by-date', 'experienceDate');

      db.createObjectStore('settings');
    },
    blocked() {
      window.dispatchEvent(new CustomEvent('app-db-blocked'));
    }
  });
  return dbPromise;
}

export async function getAllData() {
  const db = await getDB();
  const [items, images, ingredients, experienceLogs, settings] = await Promise.all([
    db.getAll('items'),
    db.getAll('images'),
    db.getAll('ingredients'),
    db.getAll('experienceLogs'),
    getSettings()
  ]);
  return { items, images, ingredients, experienceLogs, settings };
}

export async function listItemBundles(): Promise<ItemBundle[]> {
  const { items, images, ingredients, experienceLogs } = await getAllData();
  return items.map((item) => ({
    item,
    images: images.filter((image) => image.itemId === item.id).sort(byOrder),
    ingredients: ingredients.filter((ingredient) => ingredient.itemId === item.id).sort(byOrder),
    logs: experienceLogs
      .filter((log) => log.itemId === item.id)
      .sort((a, b) => b.experienceDate.localeCompare(a.experienceDate))
  }));
}

export async function getItemBundle(id: string): Promise<ItemBundle | undefined> {
  const db = await getDB();
  const item = await db.get('items', id);
  if (!item) return undefined;
  const [images, ingredients, logs] = await Promise.all([
    db.getAllFromIndex('images', 'by-item', id),
    db.getAllFromIndex('ingredients', 'by-item', id),
    db.getAllFromIndex('experienceLogs', 'by-item', id)
  ]);
  return {
    item,
    images: images.sort(byOrder),
    ingredients: ingredients.sort(byOrder),
    logs: logs.sort((a, b) => b.experienceDate.localeCompare(a.experienceDate))
  };
}

export async function saveItemBundle(bundle: ItemBundle): Promise<void> {
  const db = await getDB();
  const transaction = db.transaction(
    ['items', 'images', 'ingredients', 'experienceLogs'],
    'readwrite'
  );
  await transaction.objectStore('items').put(bundle.item);

  for (const storeName of ['images', 'ingredients', 'experienceLogs'] as const) {
    const store = transaction.objectStore(storeName);
    const oldKeys = await store.index('by-item').getAllKeys(bundle.item.id);
    await Promise.all(oldKeys.map((key) => store.delete(key)));
  }
  await Promise.all(bundle.images.map((record) => transaction.objectStore('images').put(record)));
  await Promise.all(
    bundle.ingredients.map((record) => transaction.objectStore('ingredients').put(record))
  );
  await Promise.all(
    bundle.logs.map((record) => transaction.objectStore('experienceLogs').put(record))
  );
  await transaction.done;
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDB();
  const transaction = db.transaction(
    ['items', 'images', 'ingredients', 'experienceLogs'],
    'readwrite'
  );
  await transaction.objectStore('items').delete(id);
  for (const storeName of ['images', 'ingredients', 'experienceLogs'] as const) {
    const store = transaction.objectStore(storeName);
    const keys = await store.index('by-item').getAllKeys(id);
    await Promise.all(keys.map((key) => store.delete(key)));
  }
  await transaction.done;
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const settings = await db.get('settings', 'app-settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<AppSettings> | undefined) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', settings, 'app-settings');
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  db.close();
  dbPromise = undefined;
  await deleteDB('oishii-archive');
  localStorage.removeItem('item-draft');
}

function byOrder(a: { sortOrder: number }, b: { sortOrder: number }) {
  return a.sortOrder - b.sortOrder;
}
