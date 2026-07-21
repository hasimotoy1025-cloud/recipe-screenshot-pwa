import { describe, expect, it } from 'vitest';
import {
  cropRectToPixels,
  detectDarkBackground,
  moveCropRect,
  resizeCropRect,
  shouldRunAdditionalOcr,
  transformPixels
} from './ocrPreprocess';

function makePseudoImage(
  width: number,
  height: number,
  background: [number, number, number],
  foreground: [number, number, number]
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const isSyntheticLetter =
        x >= width / 3 && x < width / 2 && y >= height / 3 && y < (height * 2) / 3;
      const color = isSyntheticLetter ? foreground : background;
      const index = (y * width + x) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

describe('OCR画像前処理', () => {
  it('濃い茶色の背景に白文字がある自作疑似画像を濃い背景と判定する', () => {
    const pixels = makePseudoImage(24, 16, [63, 37, 24], [250, 250, 245]);
    expect(detectDarkBackground(pixels, 24, 16)).toBe(true);
  });

  it('白背景に黒文字がある自作疑似画像は濃い背景と判定しない', () => {
    const pixels = makePseudoImage(24, 16, [248, 246, 239], [24, 24, 24]);
    expect(detectDarkBackground(pixels, 24, 16)).toBe(false);
  });

  it('白黒反転で濃い画素を明るく、白い画素を黒くする', () => {
    const pixels = new Uint8ClampedArray([60, 35, 20, 255, 255, 255, 255, 255]);
    const result = transformPixels(pixels, 2, 1, 'inverted', true);
    expect(result[0]).toBeGreaterThan(200);
    expect(result[4]).toBe(0);
    expect(result[1]).toBe(result[0]);
    expect(result[2]).toBe(result[0]);
  });

  it('濃い背景の二値化候補を白背景・黒文字にする', () => {
    const pixels = makePseudoImage(24, 16, [63, 37, 24], [250, 250, 245]);
    const result = transformPixels(pixels, 24, 16, 'binary', true);
    const backgroundIndex = 0;
    const foregroundIndex = (6 * 24 + 9) * 4;
    expect(result[backgroundIndex]).toBe(255);
    expect(result[foregroundIndex]).toBe(0);
  });

  it('自動モードかつ平均信頼度78%未満の場合だけ追加OCRを行う', () => {
    expect(shouldRunAdditionalOcr('auto', 77.9)).toBe(true);
    expect(shouldRunAdditionalOcr('auto', 78)).toBe(false);
    expect(shouldRunAdditionalOcr('inverted', 40)).toBe(false);
  });
});

describe('OCR切り抜き座標', () => {
  it('正規化座標を元画像のピクセル座標へ変換する', () => {
    expect(cropRectToPixels({ x: 0.25, y: 0.1, width: 0.5, height: 0.4 }, 400, 300)).toEqual({
      x: 100,
      y: 30,
      width: 200,
      height: 120
    });
  });

  it('枠の移動を画像内に制限する', () => {
    expect(moveCropRect({ x: 0.7, y: 0.7, width: 0.25, height: 0.25 }, 0.5, 0.5)).toEqual({
      x: 0.75,
      y: 0.75,
      width: 0.25,
      height: 0.25
    });
  });

  it('四隅のドラッグで切り抜き範囲を変更する', () => {
    const result = resizeCropRect({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 }, 'nw', 0.1, 0.05);
    expect(result.x).toBeCloseTo(0.3);
    expect(result.y).toBeCloseTo(0.25);
    expect(result.width).toBeCloseTo(0.5);
    expect(result.height).toBeCloseTo(0.55);
  });
});
