export type ItemType = 'recipe' | 'place' | 'product';
export type ItemStatus = 'saved' | 'planned' | 'completed';
export type ImageType = 'source' | 'completed' | 'visit' | 'purchase';

export interface Item {
  id: string;
  itemType: ItemType;
  title: string;
  sourceUrl: string;
  sourceName: string;
  status: ItemStatus;
  memo: string;
  ocrText: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredImage {
  id: string;
  itemId: string;
  imageType: ImageType;
  blob: Blob;
  fileName: string;
  mimeType: string;
  sortOrder: number;
  ocrText: string;
  createdAt: string;
}

export interface Ingredient {
  id: string;
  itemId: string;
  name: string;
  quantity: string;
  unit: string;
  note: string;
  groupName: string;
  sortOrder: number;
  included: boolean;
  sourceLine: string;
}

export interface ExperienceLog {
  id: string;
  itemId: string;
  experienceDate: string;
  rating: number;
  comment: string;
  cost: number | null;
  wouldRepeat: boolean;
  improvementNote: string;
  createdAt: string;
}

export interface AppSettings {
  imageQuality: number;
  ocrLanguage: 'jpn' | 'jpn+eng';
  lastBackupAt: string;
}

export interface ItemBundle {
  item: Item;
  images: StoredImage[];
  ingredients: Ingredient[];
  logs: ExperienceLog[];
}

export interface ImageDraft {
  id: string;
  blob: Blob;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  originalSize: number;
  convertedFromHeic: boolean;
  ocrText: string;
  ocrStatus: 'idle' | 'running' | 'done' | 'error';
}

export interface ItemSummary extends Item {
  cover?: StoredImage;
  ingredients: Ingredient[];
  logs: ExperienceLog[];
  latestRating: number | null;
  wouldRepeat: boolean | null;
}

export interface BackupManifest {
  format: 'oishii-archive';
  version: 1;
  createdAt: string;
  appVersion: string;
  counts: { items: number; images: number; ingredients: number; logs: number };
}

export interface BackupData {
  manifest: BackupManifest;
  items: Item[];
  images: Array<Omit<StoredImage, 'blob'> & { filePath: string }>;
  ingredients: Ingredient[];
  experienceLogs: ExperienceLog[];
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  imageQuality: 0.84,
  ocrLanguage: 'jpn+eng',
  lastBackupAt: ''
};

export const APP_VERSION = '0.2.0';

export function newId(): string {
  return crypto.randomUUID();
}
