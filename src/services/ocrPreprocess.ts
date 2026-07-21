import type { CropRect, OcrPreprocessMode } from '../types';

export type OcrVariant = Exclude<OcrPreprocessMode, 'auto'> | 'grayscale';
export type CropHandle = 'nw' | 'ne' | 'sw' | 'se';

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };
export const OCR_AUTO_RETRY_THRESHOLD = 78;
export const OCR_LINE_REVIEW_THRESHOLD = 70;
const MIN_CROP_SIZE = 0.08;
const MAX_OCR_DIMENSION = 3200;

export interface PreparedOcrImage {
  canvas: HTMLCanvasElement;
  darkBackground: boolean;
  width: number;
  height: number;
}

export function shouldRunAdditionalOcr(mode: OcrPreprocessMode, confidence: number): boolean {
  return mode === 'auto' && confidence < OCR_AUTO_RETRY_THRESHOLD;
}

export function detectDarkBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  if (!width || !height || pixels.length < width * height * 4) return false;
  const borderX = Math.max(1, Math.floor(width / 8));
  const borderY = Math.max(1, Math.floor(height / 8));
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 80));
  let luminanceTotal = 0;
  let darkPixels = 0;
  let samples = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (x >= borderX && x < width - borderX && y >= borderY && y < height - borderY) continue;
      const index = (y * width + x) * 4;
      const alpha = (pixels[index + 3] ?? 255) / 255;
      const red = (pixels[index] ?? 255) * alpha + 255 * (1 - alpha);
      const green = (pixels[index + 1] ?? 255) * alpha + 255 * (1 - alpha);
      const blue = (pixels[index + 2] ?? 255) * alpha + 255 * (1 - alpha);
      const luminance = getLuminance(red, green, blue);
      luminanceTotal += luminance;
      if (luminance < 120) darkPixels += 1;
      samples += 1;
    }
  }

  return samples > 0 && luminanceTotal / samples < 135 && darkPixels / samples >= 0.55;
}

export function transformPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  variant: OcrVariant,
  darkBackground = detectDarkBackground(source, width, height)
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  const luminances = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const alpha = (source[index + 3] ?? 255) / 255;
    const red = (source[index] ?? 255) * alpha + 255 * (1 - alpha);
    const green = (source[index + 1] ?? 255) * alpha + 255 * (1 - alpha);
    const blue = (source[index + 2] ?? 255) * alpha + 255 * (1 - alpha);
    luminances[pixel] = Math.round(getLuminance(red, green, blue));
  }
  const threshold = variant === 'binary' ? otsuThreshold(luminances) : 0;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const luminance = luminances[pixel] ?? 255;
    if (variant === 'original') {
      const alpha = (source[index + 3] ?? 255) / 255;
      output[index] = (source[index] ?? 255) * alpha + 255 * (1 - alpha);
      output[index + 1] = (source[index + 1] ?? 255) * alpha + 255 * (1 - alpha);
      output[index + 2] = (source[index + 2] ?? 255) * alpha + 255 * (1 - alpha);
    } else {
      let value = luminance;
      if (variant === 'inverted') value = 255 - luminance;
      if (variant === 'contrast') value = clampByte((luminance - 128) * 1.9 + 128);
      if (variant === 'binary') {
        const lightPixel = luminance > threshold;
        value = darkBackground ? (lightPixel ? 0 : 255) : lightPixel ? 255 : 0;
      }
      output[index] = value;
      output[index + 1] = value;
      output[index + 2] = value;
    }
    output[index + 3] = 255;
  }
  return output;
}

export function cropRectToPixels(
  crop: CropRect | null,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; width: number; height: number } {
  const value = crop ? sanitizeCropRect(crop) : FULL_CROP;
  const x = Math.floor(value.x * imageWidth);
  const y = Math.floor(value.y * imageHeight);
  const right = Math.ceil((value.x + value.width) * imageWidth);
  const bottom = Math.ceil((value.y + value.height) * imageHeight);
  return {
    x,
    y,
    width: Math.max(1, Math.min(imageWidth, right) - x),
    height: Math.max(1, Math.min(imageHeight, bottom) - y)
  };
}

export function moveCropRect(crop: CropRect, dx: number, dy: number): CropRect {
  const value = sanitizeCropRect(crop);
  return {
    ...value,
    x: clamp(value.x + dx, 0, 1 - value.width),
    y: clamp(value.y + dy, 0, 1 - value.height)
  };
}

export function resizeCropRect(
  crop: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number
): CropRect {
  const value = sanitizeCropRect(crop);
  const right = value.x + value.width;
  const bottom = value.y + value.height;
  let x = value.x;
  let y = value.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes('w')) x = clamp(value.x + dx, 0, right - MIN_CROP_SIZE);
  if (handle.includes('e')) nextRight = clamp(right + dx, value.x + MIN_CROP_SIZE, 1);
  if (handle.includes('n')) y = clamp(value.y + dy, 0, bottom - MIN_CROP_SIZE);
  if (handle.includes('s')) nextBottom = clamp(bottom + dy, value.y + MIN_CROP_SIZE, 1);

  return { x, y, width: nextRight - x, height: nextBottom - y };
}

export function sanitizeCropRect(crop: CropRect): CropRect {
  const width = clamp(crop.width, MIN_CROP_SIZE, 1);
  const height = clamp(crop.height, MIN_CROP_SIZE, 1);
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height
  };
}

export function isFullCrop(crop: CropRect): boolean {
  const value = sanitizeCropRect(crop);
  return value.x < 0.002 && value.y < 0.002 && value.width > 0.998 && value.height > 0.998;
}

export async function prepareOcrImage(
  blob: Blob,
  variant: OcrVariant,
  crop: CropRect | null
): Promise<PreparedOcrImage> {
  const decoded = await decodeImage(blob);
  try {
    const sourceCrop = cropRectToPixels(crop, decoded.width, decoded.height);
    const scale = Math.min(2, MAX_OCR_DIMENSION / Math.max(sourceCrop.width, sourceCrop.height));
    const width = Math.max(1, Math.round(sourceCrop.width * scale));
    const height = Math.max(1, Math.round(sourceCrop.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('このブラウザではOCR用画像を作成できません。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      decoded.source,
      sourceCrop.x,
      sourceCrop.y,
      sourceCrop.width,
      sourceCrop.height,
      0,
      0,
      width,
      height
    );
    const imageData = context.getImageData(0, 0, width, height);
    const darkBackground = detectDarkBackground(imageData.data, width, height);
    imageData.data.set(transformPixels(imageData.data, width, height, variant, darkBackground));
    context.putImageData(imageData, 0, 0);
    return { canvas, darkBackground, width, height };
  } finally {
    decoded.close?.();
  }
}

async function decodeImage(blob: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      // SafariでcreateImageBitmapが失敗した場合はHTMLImageElementへフォールバックする。
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('OCR用画像を読み込めませんでした。'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function otsuThreshold(values: Uint8ClampedArray): number {
  const histogram = new Uint32Array(256);
  for (const value of values) histogram[value] = (histogram[value] ?? 0) + 1;
  let totalSum = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    totalSum += index * (histogram[index] ?? 0);
  }
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let threshold = 127;
  for (let index = 0; index < histogram.length; index += 1) {
    backgroundWeight += histogram[index] ?? 0;
    if (!backgroundWeight) continue;
    const foregroundWeight = values.length - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += index * (histogram[index] ?? 0);
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (totalSum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = index;
    }
  }
  return threshold;
}

function getLuminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function clampByte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
