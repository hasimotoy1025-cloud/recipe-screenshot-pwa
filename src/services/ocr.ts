import type { ImageDraft, OcrLineResult, OcrPreprocessMode } from '../types';
import { prepareOcrImage, shouldRunAdditionalOcr, type OcrVariant } from './ocrPreprocess';

export interface OcrProgress {
  imageIndex: number;
  imageCount: number;
  progress: number;
  status: string;
}

export interface OcrImageResult {
  text: string;
  confidence: number;
  lines: OcrLineResult[];
  variant: OcrVariant;
  pageSegMode: string;
  darkBackground: boolean;
  triedVariants: OcrVariant[];
}

interface CandidateResult extends OcrImageResult {
  triedVariants: OcrVariant[];
}

export class OcrRunner {
  private worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null =
    null;
  private cancelled = false;

  async recognize(
    images: ImageDraft[],
    language: 'jpn' | 'jpn+eng',
    preprocessMode: OcrPreprocessMode,
    onProgress: (progress: OcrProgress) => void,
    onImageDone: (id: string, result: OcrImageResult) => void
  ): Promise<void> {
    this.cancelled = false;
    const { createWorker, PSM } = await import('tesseract.js');
    let currentIndex = 0;
    let activeVariant: OcrVariant = preprocessMode === 'auto' ? 'original' : preprocessMode;
    let activeAttempt = 1;
    let attemptCount = 1;
    try {
      const worker = await createWorker(language, undefined, {
        logger: (message) => {
          const attempt = attemptCount > 1 ? `（候補${activeAttempt}/${attemptCount}）` : '';
          if (message.status === 'recognizing text') {
            onProgress({
              imageIndex: currentIndex,
              imageCount: images.length,
              progress: message.progress,
              status: `${variantLabel(activeVariant)}を読み取っています${attempt}`
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
      this.worker = worker;

      for (currentIndex = 0; currentIndex < images.length; currentIndex += 1) {
        this.throwIfCancelled();
        const image = images[currentIndex];
        if (!image) continue;
        activeAttempt = 1;
        attemptCount = 1;
        activeVariant = preprocessMode === 'auto' ? 'original' : preprocessMode;
        const first = await recognizeCandidate(worker, image, activeVariant, false, PSM, () =>
          this.throwIfCancelled()
        );
        const candidates = [first];

        if (shouldRunAdditionalOcr(preprocessMode, first.confidence)) {
          const additions: OcrVariant[] = first.darkBackground
            ? ['inverted', 'binary', 'contrast', 'grayscale']
            : ['contrast', 'binary', 'grayscale', 'inverted'];
          attemptCount = additions.length + 1;
          for (let index = 0; index < additions.length; index += 1) {
            this.throwIfCancelled();
            const variant = additions[index];
            if (!variant) continue;
            activeVariant = variant;
            activeAttempt = index + 2;
            candidates.push(
              await recognizeCandidate(worker, image, variant, variant === 'grayscale', PSM, () =>
                this.throwIfCancelled()
              )
            );
          }
        }

        const best = candidates.reduce((winner, candidate) =>
          candidate.confidence > winner.confidence ? candidate : winner
        );
        onImageDone(image.id, {
          ...best,
          triedVariants: candidates.map((candidate) => candidate.variant)
        });
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

  private throwIfCancelled() {
    if (this.cancelled) throw new Error('OCRをキャンセルしました。');
  }
}

async function recognizeCandidate(
  worker: NonNullable<OcrRunner['worker']>,
  image: ImageDraft,
  variant: OcrVariant,
  sparseRetry: boolean,
  pageModes: (typeof import('tesseract.js'))['PSM'],
  checkCancelled: () => void
): Promise<CandidateResult> {
  const prepared = await prepareOcrImage(image.blob, variant, image.crop);
  checkCancelled();
  const pageSegMode =
    prepared.width / prepared.height >= 5
      ? pageModes.SINGLE_LINE
      : sparseRetry
        ? pageModes.SPARSE_TEXT
        : pageModes.SINGLE_BLOCK;
  await worker.setParameters({
    tessedit_pageseg_mode: pageSegMode,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300'
  });
  const result = await worker.recognize(prepared.canvas, {}, { text: true, blocks: true });
  checkCancelled();
  const text = result.data.text.trim();
  const lines = extractLineResults(result.data.blocks, text, result.data.confidence);
  const confidence = averageLineConfidence(lines, result.data.confidence);
  return {
    text,
    confidence,
    lines,
    variant,
    pageSegMode,
    darkBackground: prepared.darkBackground,
    triedVariants: [variant]
  };
}

function extractLineResults(
  blocks: import('tesseract.js').Block[] | null,
  text: string,
  pageConfidence: number
): OcrLineResult[] {
  const lines =
    blocks?.flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines
          .map((line) => ({ text: line.text.trim(), confidence: line.confidence }))
          .filter((line) => line.text)
      )
    ) ?? [];
  if (lines.length) return lines;
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line, confidence: pageConfidence }));
}

function averageLineConfidence(lines: OcrLineResult[], fallback: number): number {
  if (!lines.length) return Number.isFinite(fallback) ? fallback : 0;
  return lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length;
}

export function variantLabel(variant: OcrVariant): string {
  const labels: Record<OcrVariant, string> = {
    original: '元画像（2倍拡大）',
    grayscale: 'グレースケール',
    inverted: '白黒反転',
    contrast: 'コントラスト強調',
    binary: '二値化'
  };
  return labels[variant];
}

export function pageSegModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    '6': '単一ブロック',
    '7': '単一行',
    '11': '疎らな文字列'
  };
  return labels[mode] ?? `モード${mode}`;
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
