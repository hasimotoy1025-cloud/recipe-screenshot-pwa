export type ItemType = 'recipe' | 'place' | 'product';
export type ItemStatus = 'saved' | 'planned' | 'completed';
export type ImageType = 'source' | 'completed' | 'visit' | 'purchase';
export type OcrPreprocessMode = 'auto' | 'original' | 'inverted' | 'contrast' | 'binary';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrLineResult {
  text: string;
  confidence: number;
}

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
  needsReview?: boolean;
  sourceConfidence?: number;
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
  ocrPreprocessMode: OcrPreprocessMode;
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
  crop: CropRect | null;
  ocrText: string;
  ocrStatus: 'idle' | 'running' | 'done' | 'error';
  ocrConfidence?: number;
  ocrLines: OcrLineResult[];
  ocrVariant?: Exclude<OcrPreprocessMode, 'auto'> | 'grayscale';
  ocrPageSegMode?: string;
  ocrTriedVariants?: Array<Exclude<OcrPreprocessMode, 'auto'> | 'grayscale'>;
  ocrDarkBackground?: boolean;
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
  ocrPreprocessMode: 'auto',
  lastBackupAt: ''
};

export const APP_VERSION = '0.3.1';

export function newId(): string {
  return crypto.randomUUID();
}
