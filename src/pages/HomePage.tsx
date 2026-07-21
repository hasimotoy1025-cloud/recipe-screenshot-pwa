import { useMemo, useState } from 'react';
import type { AppSettings, ItemStatus, ItemSummary, ItemType } from '../types';
import { formatIngredientAmount } from '../services/ingredient';
import { searchItems } from '../services/search';
import {
  BlobImage,
  EmptyState,
  formatDate,
  Rating,
  STATUS_LABEL,
  TYPE_LABEL
} from '../components/ui';

type SortKey = 'updated' | 'created' | 'rating';
export type ImageSelectionSource = 'library' | 'camera';

export function HomePage({
  items,
  settings,
  storageUsage,
  navigate,
  onCreateNew,
  onImagesSelected,
  searchMode = false,
  showIosInstallTip = false
}: {
  items: ItemSummary[];
  settings: AppSettings;
  storageUsage: number;
  navigate: (route: string) => void;
  onCreateNew: () => void;
  onImagesSelected: (files: File[], source: ImageSelectionSource) => void;
  searchMode?: boolean;
  showIosInstallTip?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [itemType, setItemType] = useState<'all' | ItemType>('all');
  const [status, setStatus] = useState<'all' | ItemStatus>('all');
  const [rating, setRating] = useState(0);
  const [tag, setTag] = useState('');
  const [repeat, setRepeat] = useState<'all' | 'yes' | 'no'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');

  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);
  const filtered = useMemo(() => {
    const searched = searchItems(items, query);
    return searched
      .filter((item) => itemType === 'all' || item.itemType === itemType)
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => !rating || (item.latestRating ?? 0) >= rating)
      .filter((item) => !tag || item.tags.includes(tag))
      .filter((item) => repeat === 'all' || item.wouldRepeat === (repeat === 'yes'))
      .filter((item) => !dateFrom || item.createdAt.slice(0, 10) >= dateFrom)
      .filter((item) => !dateTo || item.createdAt.slice(0, 10) <= dateTo)
      .sort((a, b) => {
        if (sort === 'rating') return (b.latestRating ?? -1) - (a.latestRating ?? -1);
        if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [dateFrom, dateTo, itemType, items, query, rating, repeat, sort, status, tag]);
  const backupAge = settings.lastBackupAt
    ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86_400_000)
    : null;

  function selectImages(event: React.ChangeEvent<HTMLInputElement>, source: ImageSelectionSource) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length) return;
    onImagesSelected(files, source);
  }

  return (
    <div className="page home-page">
      {!searchMode && (
        <section className="hero-panel">
          <div>
            <h2>見つけた味を、すぐ記録。</h2>
            <p>画像から材料を読み取り、端末内に保存できます。</p>
          </div>
          <div className="home-create-actions">
            <div className="home-image-actions">
              <label className="button primary large">
                スクショ・写真を選ぶ
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  aria-label="スクショ・写真を選ぶ"
                  onChange={(event) => selectImages(event, 'library')}
                />
              </label>
              <label className="button ghost">
                撮影する
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="撮影する"
                  onChange={(event) => selectImages(event, 'camera')}
                />
              </label>
            </div>
            <button type="button" className="home-new-record" onClick={onCreateNew}>
              ＋ 新しい記録
            </button>
          </div>
        </section>
      )}

      {(backupAge === null || backupAge >= 30) && items.length > 0 && (
        <button type="button" className="backup-warning" onClick={() => navigate('backup')}>
          <span>!</span>{' '}
          {backupAge === null ? 'まだバックアップがありません' : '30日以上バックアップしていません'}
          <b>今すぐ作成 →</b>
        </button>
      )}

      <section className="library-section" aria-labelledby="library-heading">
        <div className="library-head">
          <h2 id="library-heading">{searchMode ? '記録を探す' : '保存した記録'}</h2>
          <select
            aria-label="並び順"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            <option value="updated">更新日順</option>
            <option value="created">登録日順</option>
            <option value="rating">評価順</option>
          </select>
        </div>
        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            autoFocus={searchMode}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="タイトル、材料、タグ、OCR原文から検索"
            aria-label="フリーワード検索"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="検索を消去">
              ×
            </button>
          )}
        </div>
        <div className="filter-pills" aria-label="種別の絞り込み">
          {(['all', 'recipe', 'place', 'product'] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={itemType === value ? 'active' : ''}
              onClick={() => setItemType(value)}
            >
              {value === 'all' ? 'すべて' : TYPE_LABEL[value]}
            </button>
          ))}
        </div>
        <details className="advanced-filters" open={searchMode}>
          <summary>詳細な絞り込み</summary>
          <div className="filter-grid">
            <label>
              状態
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="all">すべて</option>
                <option value="saved">未実施</option>
                <option value="planned">予定</option>
                <option value="completed">実施済み</option>
              </select>
            </label>
            <label>
              最低評価
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                <option value="0">指定なし</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}以上
                  </option>
                ))}
              </select>
            </label>
            <label>
              タグ
              <select value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">すべて</option>
                {tags.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              また体験したい
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
                <option value="all">指定なし</option>
                <option value="yes">はい</option>
                <option value="no">いいえ</option>
              </select>
            </label>
            <label>
              登録日（開始）
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              登録日（終了）
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </details>
        <p className="result-count">{filtered.length}件を表示</p>

        {filtered.length ? (
          <div className="card-grid">
            {filtered.map((item) => (
              <button
                type="button"
                className="item-card"
                key={item.id}
                onClick={() => navigate(`item/${item.id}`)}
              >
                <div className="card-image">
                  {item.cover ? (
                    <BlobImage blob={item.cover.blob} alt="" />
                  ) : (
                    <div className="image-placeholder">
                      {item.itemType === 'recipe' ? '♨' : item.itemType === 'place' ? '⌂' : '□'}
                    </div>
                  )}
                  <span className={`type-chip ${item.itemType}`}>{TYPE_LABEL[item.itemType]}</span>
                </div>
                <div className="card-body">
                  <div className="card-title-row">
                    <h3>{item.title}</h3>
                    <span>→</span>
                  </div>
                  <div className="tag-row">
                    {item.tags.slice(0, 3).map((value) => (
                      <span key={value}>#{value}</span>
                    ))}
                  </div>
                  {item.itemType === 'recipe' &&
                    item.ingredients.some((ingredient) => ingredient.included) && (
                      <div className="card-ingredients" aria-label="主な材料">
                        {item.ingredients
                          .filter((ingredient) => ingredient.included)
                          .slice(0, 2)
                          .map((ingredient) => (
                            <span key={ingredient.id}>
                              <span>{ingredient.name}</span>
                              <b dir="ltr">
                                {formatIngredientAmount(ingredient.quantity, ingredient.unit)}
                              </b>
                            </span>
                          ))}
                      </div>
                    )}
                  <div className="card-meta">
                    <span className={`status ${item.status}`}>{STATUS_LABEL[item.status]}</span>
                    {item.latestRating ? (
                      <Rating value={item.latestRating} />
                    ) : (
                      <span className="muted">未評価</span>
                    )}
                    <time>{formatDate(item.createdAt)}</time>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={query || itemType !== 'all' ? '⌕' : '＋'}
            title={items.length ? '条件に合う記録がありません' : '最初の記録を残しましょう'}
          >
            {items.length
              ? '検索語や絞り込み条件を変えてみてください。'
              : 'スクリーンショット1枚から始められます。'}
          </EmptyState>
        )}
      </section>

      <details className="home-support-details">
        <summary>
          <span>保存・バックアップ情報</span>
          <small>
            {searchMode ? '保存容量とバックアップ状況' : '保存容量、同期、インストール'}
          </small>
        </summary>
        <div className="home-support-content">
          <section className="overview-strip" aria-label="保存状況">
            <div>
              <strong>{items.length}</strong>
              <span>件の記録</span>
            </div>
            <div>
              <strong>{storageUsage ? formatStorage(storageUsage) : '—'}</strong>
              <span>使用容量</span>
            </div>
            <div className={backupAge === null || backupAge >= 30 ? 'warn' : ''}>
              <strong>{backupAge === null ? '未実施' : `${backupAge}日前`}</strong>
              <span>最終バックアップ</span>
            </div>
          </section>
          {!searchMode && showIosInstallTip && (
            <aside className="ios-install-tip">
              <span aria-hidden="true">↗</span>
              <div>
                <b>Safariの共有ボタンからホーム画面へ追加できます</b>
                <p>「ホーム画面に追加」→「Webアプリとして開く」をオン→「追加」の順です。</p>
              </div>
            </aside>
          )}
          {!searchMode && (
            <aside className="device-sync-note">
              <span aria-hidden="true">i</span>
              <div>
                <b>このデータは、この端末のこのWebアプリだけに保存されます</b>
                <p>
                  iPhoneとiPad
                  miniの記録は自動同期されません。別端末へ移すときはZIPバックアップを使ってください。
                </p>
              </div>
              <button type="button" onClick={() => navigate('backup')}>
                バックアップへ
              </button>
            </aside>
          )}
        </div>
      </details>
    </div>
  );
}

function formatStorage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
