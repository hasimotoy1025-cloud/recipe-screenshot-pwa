import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { assertBackupData, inspectBackup } from './backup';
import type { BackupData } from '../types';

function validBackup(): BackupData {
  return {
    manifest: {
      format: 'oishii-archive',
      version: 1,
      createdAt: '2026-07-20T00:00:00.000Z',
      appVersion: '0.1.0',
      counts: { items: 1, images: 1, ingredients: 0, logs: 0 }
    },
    items: [
      {
        id: 'item-1',
        itemType: 'recipe',
        title: 'テスト',
        sourceUrl: '',
        sourceName: '',
        status: 'saved',
        memo: '',
        ocrText: '',
        tags: [],
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z'
      }
    ],
    images: [
      {
        id: 'image-1',
        itemId: 'item-1',
        imageType: 'source',
        fileName: 'image.webp',
        mimeType: 'image/webp',
        sortOrder: 0,
        ocrText: '',
        createdAt: '2026-07-20T00:00:00.000Z',
        filePath: 'images/image-1.webp'
      }
    ],
    ingredients: [],
    experienceLogs: [],
    settings: { imageQuality: 0.84, ocrLanguage: 'jpn+eng', lastBackupAt: '' }
  };
}

describe('assertBackupData', () => {
  it('正しいバージョン付きバックアップを受け入れる', () => {
    expect(() => assertBackupData(validBackup())).not.toThrow();
  });

  it('非対応バージョンを復元前に拒否する', () => {
    const backup = validBackup();
    (backup.manifest as { version: number }).version = 99;
    expect(() => assertBackupData(backup)).toThrow('バージョン 99');
  });

  it('関連先のない画像を復元前に拒否する', () => {
    const backup = validBackup();
    backup.images[0]!.itemId = 'missing-item';
    expect(() => assertBackupData(backup)).toThrow('関連先のないデータ');
  });

  it('壊れた配列構造を拒否する', () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    backup.ingredients = null;
    expect(() => assertBackupData(backup)).toThrow('ingredients');
  });

  it('ZIP内のJSONと画像が揃ったバックアップを検証する', async () => {
    const backup = validBackup();
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify(backup));
    zip.file('images/image-1.webp', new Uint8Array([82, 73, 70, 70]));
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(
      inspectBackup(new Blob([bytes], { type: 'application/zip' }))
    ).resolves.toMatchObject({
      manifest: { format: 'oishii-archive', version: 1 }
    });
  });

  it('ZIP内の画像不足を復元前に拒否する', async () => {
    const backup = validBackup();
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify(backup));
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(inspectBackup(new Blob([bytes], { type: 'application/zip' }))).rejects.toThrow(
      '画像ファイルが不足'
    );
  });
});
