import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Layout } from '../components/Layout';
import { DEFAULT_SETTINGS, type AppSettings, type ItemSummary } from '../types';
import { HomePage } from './HomePage';

const item: ItemSummary = {
  id: 'item-1',
  itemType: 'recipe',
  title: '焼きラーメン',
  sourceUrl: '',
  sourceName: '',
  status: 'saved',
  memo: '',
  ocrText: '',
  tags: ['中華'],
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  ingredients: [],
  logs: [],
  latestRating: null,
  wouldRepeat: null
};

const settingsWithoutBackup: AppSettings = {
  ...DEFAULT_SETTINGS,
  lastBackupAt: ''
};

function renderHome({
  items = [item],
  settings = settingsWithoutBackup,
  searchMode = false,
  showIosInstallTip = true
}: {
  items?: ItemSummary[];
  settings?: AppSettings;
  searchMode?: boolean;
  showIosInstallTip?: boolean;
} = {}) {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <HomePage
      items={items}
      settings={settings}
      storageUsage={2 * 1024 * 1024}
      navigate={() => undefined}
      onCreateNew={() => undefined}
      onImagesSelected={() => undefined}
      searchMode={searchMode}
      showIosInstallTip={showIosInstallTip}
    />
  );
  return root;
}

function findButton(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((button) => button.textContent?.includes(label));
}

function expectBefore(first: Element | undefined | null, second: Element | undefined | null) {
  expect(first).toBeTruthy();
  expect(second).toBeTruthy();
  expect(first!.compareDocumentPosition(second!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('HomePage', () => {
  it('新しい記録ボタンを記録一覧より前に表示する', () => {
    const root = renderHome();
    const createButton = findButton(root, '新しい記録');

    expect(createButton).toBeTruthy();
    expectBefore(createButton, root.querySelector('.library-section'));
  });

  it('検索と絞り込みを記録カード一覧より前に表示する', () => {
    const root = renderHome();
    const cardGrid = root.querySelector('.card-grid');

    expectBefore(root.querySelector('.search-box'), cardGrid);
    expectBefore(root.querySelector('.filter-pills'), cardGrid);
    expectBefore(root.querySelector('.advanced-filters'), cardGrid);
  });

  it('記録一覧を補助情報より前に表示する', () => {
    const root = renderHome();

    expectBefore(root.querySelector('.card-grid'), root.querySelector('.home-support-details'));
  });

  it('保存・同期・インストールの通常説明を初期状態で折りたたむ', () => {
    const root = renderHome();
    const details = root.querySelector<HTMLDetailsElement>('.home-support-details');

    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('保存・バックアップ情報');
    expect(details?.textContent).toContain('使用容量');
    expect(details?.textContent).toContain('自動同期されません');
    expect(details?.textContent).toContain('ホーム画面へ追加できます');
  });

  it('対応が必要なバックアップ警告は折りたたみ外に表示する', () => {
    const root = renderHome();
    const warning = root.querySelector('.backup-warning');
    const details = root.querySelector('.home-support-details');

    expect(warning?.textContent).toContain('まだバックアップがありません');
    expect(details?.contains(warning)).toBe(false);
  });

  it('記録が0件の空状態を維持する', () => {
    const root = renderHome({ items: [] });

    expect(root.textContent).toContain('最初の記録を残しましょう');
    expect(root.textContent).toContain('スクリーンショット1枚から始められます。');
    expect(root.querySelector('.backup-warning')).toBeNull();
  });

  it('検索画面の見出しと詳細絞り込みを維持する', () => {
    const root = renderHome({ searchMode: true });
    const advancedFilters = root.querySelector<HTMLDetailsElement>('.advanced-filters');

    expect(root.querySelector('#library-heading')?.textContent).toBe('記録を探す');
    expect(root.querySelector<HTMLInputElement>('[aria-label="フリーワード検索"]')?.autofocus).toBe(
      true
    );
    expect(advancedFilters?.open).toBe(true);
    expect(root.querySelector('.card-grid')).toBeTruthy();
    expect(findButton(root, '新しい記録')).toBeUndefined();
  });

  it('ホーム画面から重複する英語小見出しを削除する', () => {
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(
      <Layout route="home" navigate={() => undefined}>
        <HomePage
          items={[item]}
          settings={settingsWithoutBackup}
          storageUsage={0}
          navigate={() => undefined}
          onCreateNew={() => undefined}
          onImagesSelected={() => undefined}
        />
      </Layout>
    );

    expect(root.textContent).not.toContain('MY LOCAL ARCHIVE');
    expect(root.textContent).not.toContain('YOUR PRIVATE COOKBOOK');
    expect(root.textContent).not.toContain('YOUR COLLECTION');
    expect(root.textContent).not.toContain('FIND A MEMORY');
  });
});
