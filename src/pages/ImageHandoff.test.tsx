import { StrictMode, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage } from '../services/image';
import { DEFAULT_SETTINGS } from '../types';
import { EditorPage } from './EditorPage';
import { HomePage, type ImageSelectionSource } from './HomePage';

vi.mock('../services/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/image')>();
  return { ...actual, compressImage: vi.fn() };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const compressImageMock = vi.mocked(compressImage);
let roots: Root[] = [];
let objectUrlIndex = 0;

beforeEach(() => {
  localStorage.clear();
  objectUrlIndex = 0;
  compressImageMock.mockImplementation(async (file) => ({
    blob: new Blob(['name' in file ? file.name : 'image'], { type: 'image/webp' }),
    width: 100,
    height: 100,
    originalSize: file.size,
    convertedFromHeic: false
  }));
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:test-${++objectUrlIndex}`)
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(async () => {
  await act(async () => {
    roots.forEach((root) => root.unmount());
  });
  roots = [];
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function renderInteractive(node: ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return container;
}

async function settleAsyncWork() {
  await act(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  });
}

function setInputFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
}

function home(
  onImagesSelected: (files: File[], source: ImageSelectionSource) => void = () => undefined,
  onCreateNew = () => undefined
) {
  return (
    <HomePage
      items={[]}
      settings={DEFAULT_SETTINGS}
      storageUsage={0}
      navigate={() => undefined}
      onCreateNew={onCreateNew}
      onImagesSelected={onImagesSelected}
    />
  );
}

function editor(
  initialImageSelection?: {
    token: string;
    files: File[];
    source: 'library' | 'camera';
  },
  onInitialImagesConsumed: (token: string) => void = () => undefined
) {
  return (
    <EditorPage
      settings={DEFAULT_SETTINGS}
      initialImageSelection={initialImageSelection}
      onInitialImagesConsumed={onInitialImagesConsumed}
      onSaved={() => undefined}
      onCancel={() => undefined}
    />
  );
}

describe('HomePageの画像選択', () => {
  it('画像選択と撮影にネイティブfile inputを設定する', async () => {
    const container = await renderInteractive(home());
    const libraryInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="スクショ・写真を選ぶ"]'
    );
    const cameraInput = container.querySelector<HTMLInputElement>('input[aria-label="撮影する"]');

    expect(libraryInput?.type).toBe('file');
    expect(libraryInput?.accept).toBe('image/*');
    expect(libraryInput?.multiple).toBe(true);
    expect(cameraInput?.type).toBe('file');
    expect(cameraInput?.accept).toBe('image/*');
    expect(cameraInput?.getAttribute('capture')).toBe('environment');
  });

  it('選択をキャンセルした場合は画像受け渡しを開始しない', async () => {
    const onImagesSelected = vi.fn();
    const container = await renderInteractive(home(onImagesSelected));
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="スクショ・写真を選ぶ"]'
    )!;
    setInputFiles(input, []);

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onImagesSelected).not.toHaveBeenCalled();
  });

  it('FileListを選択順のFile配列へ変換して渡す', async () => {
    const onImagesSelected = vi.fn();
    const container = await renderInteractive(home(onImagesSelected));
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="スクショ・写真を選ぶ"]'
    )!;
    const files = [
      new File(['1'], 'first.png', { type: 'image/png' }),
      new File(['2'], 'second.jpg', { type: 'image/jpeg' })
    ];
    setInputFiles(input, files);

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onImagesSelected).toHaveBeenCalledWith(files, 'library');
  });

  it('既存の新しい記録ボタンを維持する', async () => {
    const onCreateNew = vi.fn();
    const container = await renderInteractive(home(undefined, onCreateNew));
    const button = [...container.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes('新しい記録')
    );

    await act(async () => {
      button?.click();
    });

    expect(onCreateNew).toHaveBeenCalledOnce();
  });
});

describe('EditorPageの初期画像受け渡し', () => {
  it('StrictModeでも同じtokenを一度だけ処理し、選択順と最大5枚を維持する', async () => {
    const files = Array.from(
      { length: 6 },
      (_, index) => new File([String(index)], `${index + 1}.png`, { type: 'image/png' })
    );
    const onConsumed = vi.fn();
    const container = await renderInteractive(
      <StrictMode>
        {editor({ token: 'home-selection', files, source: 'library' }, onConsumed)}
      </StrictMode>
    );

    await settleAsyncWork();

    expect(compressImageMock.mock.calls.map(([file]) => file)).toEqual(files.slice(0, 5));
    expect(container.querySelectorAll('.image-draft-grid article')).toHaveLength(5);
    expect(onConsumed).toHaveBeenCalledOnce();
    expect(onConsumed).toHaveBeenCalledWith('home-selection');
  });

  it('通常のEditor表示では画像を自動追加しない', async () => {
    const container = await renderInteractive(editor());

    await settleAsyncWork();

    expect(compressImageMock).not.toHaveBeenCalled();
    expect(container.querySelector('.image-draft-grid')).toBeNull();
  });

  it('Editor内の既存画像選択を引き続き処理する', async () => {
    const container = await renderInteractive(editor());
    const input = container.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    const file = new File(['manual'], 'manual.png', { type: 'image/png' });
    setInputFiles(input, [file]);

    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settleAsyncWork();

    expect(compressImageMock).toHaveBeenCalledOnce();
    expect(compressImageMock).toHaveBeenCalledWith(file, DEFAULT_SETTINGS.imageQuality);
    expect(container.querySelectorAll('.image-draft-grid article')).toHaveLength(1);
  });
});
