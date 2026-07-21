const MAX_FILE_SIZE = 25 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  convertedFromHeic: boolean;
}

export async function compressImage(
  file: File | Blob,
  quality = 0.84,
  maxSide = 1600
): Promise<CompressedImage> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('画像が大きすぎます。25MB以下の画像を選んでください。');
  }
  if (!isSupportedImage(file)) {
    throw new Error(
      'この画像形式には対応していません。JPEG、PNG、WebP、HEIC、HEIFを選んでください。'
    );
  }

  const convertedFromHeic = isHeicLike(file);
  let source: Blob = file;
  let decoded: DecodedImage;
  try {
    // Safari 17以降はHEICもここでネイティブにデコードできる。
    decoded = await decodeImage(source);
  } catch (nativeError) {
    if (!convertedFromHeic) {
      throw new Error('画像を読み込めませんでした。別の画像形式でお試しください。', {
        cause: nativeError
      });
    }
    try {
      // Safariが直接扱えないHEIC/HEIFだけを、端末内ワーカーでJPEGへ変換する。
      source = await convertHeicToJpeg(file, quality);
      decoded = await decodeImage(source);
    } catch (conversionError) {
      throw new Error(
        'HEIC／HEIF画像を端末内で変換できませんでした。iPhone／iPadの「設定」→「カメラ」→「フォーマット」を「互換性優先」にして撮影するか、写真アプリでスクリーンショットにしてお試しください。',
        { cause: conversionError }
      );
    }
  }

  const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    decoded.cleanup();
    throw new Error('このブラウザでは画像を圧縮できません。');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(decoded.source, 0, 0, width, height);
  decoded.cleanup();

  const outputType = supportsWebP() ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, quality)
  );
  if (!blob) throw new Error('画像の圧縮に失敗しました。');
  return { blob, width, height, originalSize: file.size, convertedFromHeic };
}

export function isHeicLike(file: File | Blob): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith('image/heic') || type.startsWith('image/heif')) return true;
  const name = 'name' in file && typeof file.name === 'string' ? file.name : '';
  return /\.(?:heic|heif)$/i.test(name);
}

export function isSupportedImage(file: File | Blob): boolean {
  if (SUPPORTED_TYPES.includes(file.type.toLowerCase()) || isHeicLike(file)) return true;
  const name = 'name' in file && typeof file.name === 'string' ? file.name : '';
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return !file.type && SUPPORTED_EXTENSIONS.includes(extension);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function supportsWebP(): boolean {
  const canvas = document.createElement('canvas');
  try {
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close()
      };
    } catch {
      // Safariの<img>デコーダーで再試行する。
    }
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('画像デコーダーが形式を認識できませんでした。'));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function convertHeicToJpeg(blob: Blob, quality: number): Promise<Blob> {
  const worker = new Worker(new URL('./heic.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
      worker.terminate();
      if (event.data.blob) resolve(event.data.blob);
      else reject(new Error(event.data.error ?? 'HEIC／HEIFの変換に失敗しました。'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'HEIC／HEIF変換ワーカーを起動できませんでした。'));
    };
    worker.postMessage({ blob, quality: Math.max(0.82, quality) });
  });
}
