import type { ImageDraft } from '../types';

export interface OcrProgress {
  imageIndex: number;
  imageCount: number;
  progress: number;
  status: string;
}

export class OcrRunner {
  private worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null =
    null;
  private cancelled = false;

  async recognize(
    images: ImageDraft[],
    language: 'jpn' | 'jpn+eng',
    onProgress: (progress: OcrProgress) => void,
    onImageDone: (id: string, text: string) => void
  ): Promise<void> {
    this.cancelled = false;
    const { createWorker } = await import('tesseract.js');
    let currentIndex = 0;
    try {
      this.worker = await createWorker(language, undefined, {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            onProgress({
              imageIndex: currentIndex,
              imageCount: images.length,
              progress: message.progress,
              status: '文字を読み取っています'
            });
          } else {
            onProgress({
              imageIndex: currentIndex,
              imageCount: images.length,
              progress: 0,
              status: translateStatus(message.status)
            });
          }
        }
      });

      for (currentIndex = 0; currentIndex < images.length; currentIndex += 1) {
        if (this.cancelled) throw new Error('OCRをキャンセルしました。');
        const image = images[currentIndex];
        if (!image) continue;
        const result = await this.worker.recognize(image.blob);
        onImageDone(image.id, result.data.text.trim());
      }
    } finally {
      await this.worker?.terminate().catch(() => undefined);
      this.worker = null;
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    await this.worker?.terminate().catch(() => undefined);
    this.worker = null;
  }
}

function translateStatus(status: string): string {
  const statuses: Record<string, string> = {
    'loading tesseract core': 'OCRエンジンを読み込んでいます',
    'initializing tesseract': 'OCRエンジンを準備しています',
    'loading language traineddata': '日本語モデルを読み込んでいます（初回は時間がかかります）',
    'initializing api': '文字認識を準備しています'
  };
  return statuses[status] ?? 'OCRを準備しています';
}
