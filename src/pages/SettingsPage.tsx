import { useEffect, useState } from 'react';
import { clearAllData, getAllData, saveSettings } from '../db';
import { APP_VERSION, type AppSettings } from '../types';
import { formatBytes } from '../services/image';
import { formatDate } from '../components/ui';

interface Stats {
  items: number;
  images: number;
  usage: number;
  quota: number;
  persisted: boolean;
}

export function SettingsPage({
  settings,
  onChanged
}: {
  settings: AppSettings;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [stats, setStats] = useState<Stats>({
    items: 0,
    images: 0,
    usage: 0,
    quota: 0,
    persisted: false
  });
  const [message, setMessage] = useState('');

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    void refreshStats();
  }, []);

  async function refreshStats() {
    const [data, estimate, persisted] = await Promise.all([
      getAllData(),
      navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0, quota: 0 }),
      navigator.storage?.persisted?.() ?? Promise.resolve(false)
    ]);
    setStats({
      items: data.items.length,
      images: data.images.length,
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted
    });
  }

  async function update(next: AppSettings) {
    setDraft(next);
    await saveSettings(next);
    setMessage('設定を保存しました。');
    await onChanged();
  }

  async function requestPersistence() {
    if (!navigator.storage?.persist) {
      setMessage('このブラウザは永続ストレージ要求に対応していません。');
      return;
    }
    const granted = await navigator.storage.persist();
    setMessage(
      granted
        ? '永続ストレージが許可されました。'
        : '永続ストレージは許可されませんでした。定期的にバックアップしてください。'
    );
    await refreshStats();
  }

  async function removeAll() {
    if (!window.confirm('すべての記録・画像・設定を削除します。バックアップは作成済みですか？'))
      return;
    const phrase = window.prompt('最終確認です。削除するには「全削除」と入力してください。');
    if (phrase !== '全削除') {
      setMessage('全データ削除をキャンセルしました。');
      return;
    }
    await clearAllData();
    setMessage('端末内の全データを削除しました。');
    await onChanged();
    await refreshStats();
  }

  const percentage = stats.quota ? Math.min(100, (stats.usage / stats.quota) * 100) : 0;
  return (
    <div className="page settings-page">
      <section className="page-heading">
        <p className="eyebrow">APP PREFERENCES</p>
        <h2>設定</h2>
        <p>保存状況と端末内処理の設定を確認できます。</p>
      </section>
      {message && <div className="message success">{message}</div>}
      <div className="stats-grid">
        <article>
          <span>登録件数</span>
          <strong>{stats.items}</strong>
          <small>件</small>
        </article>
        <article>
          <span>画像枚数</span>
          <strong>{stats.images}</strong>
          <small>枚</small>
        </article>
        <article>
          <span>使用容量</span>
          <strong>{formatBytes(stats.usage)}</strong>
        </article>
        <article>
          <span>最終バックアップ</span>
          <strong className="date-stat">{formatDate(draft.lastBackupAt)}</strong>
        </article>
      </div>
      <section className="settings-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">STORAGE</p>
            <h3>保存領域</h3>
          </div>
          <span>{stats.persisted ? '永続化済み' : '通常保存'}</span>
        </div>
        <div className="storage-meter">
          <div style={{ width: `${percentage}%` }} />
          <span>
            {formatBytes(stats.usage)} / {stats.quota ? formatBytes(stats.quota) : '上限不明'}
          </span>
        </div>
        <p>
          表示値はこのオリジン全体の概算です。ブラウザの設定や端末容量によって削除される場合があります。
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => void requestPersistence()}
          disabled={stats.persisted}
        >
          {stats.persisted ? '永続ストレージは許可済み' : '永続ストレージを要求'}
        </button>
      </section>
      <section className="settings-section">
        <p className="eyebrow">IMAGE & OCR</p>
        <h3>画像と文字認識</h3>
        <div className="setting-row">
          <div>
            <b>画像圧縮品質</b>
            <small>高いほど文字が読みやすく、容量が増えます。</small>
          </div>
          <div className="range-control">
            <input
              type="range"
              min="0.65"
              max="0.95"
              step="0.01"
              value={draft.imageQuality}
              onChange={(e) => setDraft({ ...draft, imageQuality: Number(e.target.value) })}
              onPointerUp={() => void update(draft)}
              onKeyUp={() => void update(draft)}
            />
            <b>{Math.round(draft.imageQuality * 100)}%</b>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <b>OCR言語</b>
            <small>英数字を含むレシピは「日本語＋英語」が適しています。</small>
          </div>
          <select
            value={draft.ocrLanguage}
            onChange={(e) =>
              void update({ ...draft, ocrLanguage: e.target.value as AppSettings['ocrLanguage'] })
            }
          >
            <option value="jpn+eng">日本語＋英語</option>
            <option value="jpn">日本語のみ</option>
          </select>
        </div>
        <div className="setting-row">
          <div>
            <b>OCR前処理</b>
            <small>
              「自動」は通常OCRの信頼度が低い場合だけ、反転・強調・二値化などを比較します。
            </small>
          </div>
          <select
            value={draft.ocrPreprocessMode}
            onChange={(e) =>
              void update({
                ...draft,
                ocrPreprocessMode: e.target.value as AppSettings['ocrPreprocessMode']
              })
            }
          >
            <option value="auto">自動（おすすめ）</option>
            <option value="original">元画像</option>
            <option value="inverted">白黒反転</option>
            <option value="contrast">コントラスト強調</option>
            <option value="binary">二値化</option>
          </select>
        </div>
      </section>
      <section className="settings-section">
        <p className="eyebrow">ABOUT</p>
        <h3>アプリ情報</h3>
        <dl className="about-list">
          <div>
            <dt>アプリバージョン</dt>
            <dd>{APP_VERSION}</dd>
          </div>
          <div>
            <dt>データ保存先</dt>
            <dd>このiPhone／iPadのWebアプリ内</dd>
          </div>
          <div>
            <dt>端末間同期</dt>
            <dd>なし（ZIPで移行）</dd>
          </div>
          <div>
            <dt>外部送信</dt>
            <dd>なし（OCRモデルの初回取得を除く）</dd>
          </div>
          <div>
            <dt>料金</dt>
            <dd>無料・APIキー不要</dd>
          </div>
        </dl>
      </section>
      <section className="settings-section danger-settings">
        <div>
          <p className="eyebrow">DANGER ZONE</p>
          <h3>全データ削除</h3>
          <p>このブラウザ内の記録、画像、設定をすべて削除します。元に戻せません。</p>
        </div>
        <button type="button" className="danger" onClick={() => void removeAll()}>
          全データを削除
        </button>
      </section>
    </div>
  );
}
