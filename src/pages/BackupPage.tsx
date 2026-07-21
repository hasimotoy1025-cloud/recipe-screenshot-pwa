import { useEffect, useRef, useState } from 'react';
import type { BackupData } from '../types';
import { createBackup, inspectBackup, restoreBackup, type RestoreMode } from '../services/backup';
import { formatBytes } from '../services/image';
import { formatDate, Spinner } from '../components/ui';

export function BackupPage({ onChanged }: { onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File>();
  const [inspection, setInspection] = useState<BackupData>();
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [generated, setGenerated] = useState<{ url: string; fileName: string; size: number }>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (generated) URL.revokeObjectURL(generated.url);
    },
    [generated]
  );

  async function download() {
    setBusy('バックアップを作成しています');
    setError('');
    try {
      const result = await createBackup();
      const url = URL.createObjectURL(result.blob);
      setGenerated((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url, fileName: result.fileName, size: result.blob.size };
      });
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setNotice(
        `バックアップを作成しました（${formatBytes(result.blob.size)}）。Safariで自動保存されない場合は下の保存リンクをタップしてください。`
      );
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'バックアップを作成できませんでした。');
    } finally {
      setBusy('');
    }
  }

  async function chooseFile(selected?: File) {
    setFile(selected);
    setInspection(undefined);
    setError('');
    if (!selected) return;
    setBusy('ファイルの内容を検証しています');
    try {
      setInspection(await inspectBackup(selected));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'バックアップを検証できませんでした。');
    } finally {
      setBusy('');
    }
  }

  async function restore() {
    if (!file || !inspection) return;
    const action =
      mode === 'replace' ? '現在の全データを削除して置き換え' : '現在のデータを残して追加';
    if (!window.confirm(`${action}ます。復元を開始しますか？`)) return;
    setBusy('画像を含むデータを復元しています');
    setError('');
    try {
      await restoreBackup(file, mode);
      setNotice(`${inspection.manifest.counts.items}件の記録を復元しました。`);
      setFile(undefined);
      setInspection(undefined);
      if (inputRef.current) inputRef.current.value = '';
      await onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '復元に失敗しました。現在のデータを確認してください。'
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="page backup-page">
      <section className="page-heading">
        <p className="eyebrow">KEEP YOUR MEMORIES SAFE</p>
        <h2>バックアップと復元</h2>
        <p>
          データはこのiPhone／iPadのWebアプリだけに保存されています。別端末へは自動同期されないため、定期的にZIPを「ファイル」アプリへ保存してください。
        </p>
      </section>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}
      {busy && (
        <div className="busy-overlay">
          <Spinner label={busy} />
        </div>
      )}

      <div className="backup-grid">
        <section className="backup-card export-card">
          <div className="backup-number">01</div>
          <span className="backup-icon">↓</span>
          <h3>全データを書き出す</h3>
          <p>記録、材料、実施履歴、すべての画像を1つのZIPファイルにまとめます。</p>
          <ul>
            <li>画像を含む完全バックアップ</li>
            <li>バージョン情報・作成日時つき</li>
            <li>外部サーバーへ送信しません</li>
          </ul>
          <button
            type="button"
            className="primary large"
            onClick={() => void download()}
            disabled={Boolean(busy)}
          >
            ZIPを端末に保存
          </button>
          {generated && (
            <a
              className="button ghost backup-download-link"
              href={generated.url}
              download={generated.fileName}
            >
              保存リンクを開く（{formatBytes(generated.size)}）
            </a>
          )}
        </section>
        <section className="backup-card restore-card">
          <div className="backup-number">02</div>
          <span className="backup-icon">↑</span>
          <h3>バックアップから復元</h3>
          <p>まずファイルを検証します。検証が通るまで現在のデータは変更しません。</p>
          <label className="file-drop">
            ファイルを選択
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(e) => void chooseFile(e.target.files?.[0])}
            />
            <small>
              {file ? `${file.name}（${formatBytes(file.size)}）` : 'oishii-backup-YYYY-MM-DD.zip'}
            </small>
          </label>
          {inspection && (
            <div className="inspection">
              <b>検証に成功しました</b>
              <dl>
                <div>
                  <dt>作成日</dt>
                  <dd>{formatDate(inspection.manifest.createdAt)}</dd>
                </div>
                <div>
                  <dt>記録</dt>
                  <dd>{inspection.manifest.counts.items}件</dd>
                </div>
                <div>
                  <dt>画像</dt>
                  <dd>{inspection.manifest.counts.images}枚</dd>
                </div>
                <div>
                  <dt>形式</dt>
                  <dd>v{inspection.manifest.version}</dd>
                </div>
              </dl>
              <fieldset>
                <legend>現在のデータの扱い</legend>
                <label>
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={mode === 'merge'}
                    onChange={() => setMode('merge')}
                  />
                  <span>
                    <b>追加取り込み（推奨）</b>
                    <small>現在のデータを残し、重複IDは自動で振り直します。</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="restore-mode"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                  />
                  <span>
                    <b>全置換</b>
                    <small>現在の記録をすべて削除して置き換えます。</small>
                  </span>
                </label>
              </fieldset>
              <button
                type="button"
                className={mode === 'replace' ? 'danger' : 'secondary'}
                onClick={() => void restore()}
                disabled={Boolean(busy)}
              >
                この内容で復元
              </button>
            </div>
          )}
        </section>
      </div>
      <aside className="backup-tip">
        <span>!</span>
        <div>
          <b>バックアップファイルもプライベートなデータです</b>
          <p>
            登録画像やURLを含みます。第三者へ共有せず、自分だけがアクセスできる場所に保管してください。
          </p>
        </div>
      </aside>
    </div>
  );
}
