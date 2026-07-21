import { describe, expect, it } from 'vitest';
import { isHeicLike, isSupportedImage } from './image';

describe('iPhone／iPadの画像形式判定', () => {
  it.each([
    ['photo.HEIC', 'image/heic'],
    ['photo.heif', 'image/heif'],
    ['photo.HEIC', ''],
    ['photo.heif', 'application/octet-stream']
  ])('%s（%s）をHEIC／HEIFとして判定する', (name, type) => {
    expect(isHeicLike(new File(['image'], name, { type }))).toBe(true);
  });

  it.each([
    ['screen.png', 'image/png'],
    ['screen.PNG', ''],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.heic', 'image/heic'],
    ['photo.HEIF', '']
  ])('%s（%s）を登録可能な画像として受け入れる', (name, type) => {
    expect(isSupportedImage(new File(['image'], name, { type }))).toBe(true);
  });

  it('動画と不明な形式を拒否する', () => {
    expect(isSupportedImage(new File(['video'], 'clip.mov', { type: 'video/quicktime' }))).toBe(
      false
    );
    expect(isSupportedImage(new File(['data'], 'unknown.bin', { type: '' }))).toBe(false);
  });
});
