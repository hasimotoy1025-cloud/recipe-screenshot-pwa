import { useEffect, useRef, useState } from 'react';
import { getItemBundle, saveItemBundle } from '../db';
import { formatBytes, compressImage } from '../services/image';
import { extractIngredients } from '../services/ingredientParser';
import { OcrRunner, type OcrProgress } from '../services/ocr';
import {
  newId,
  type AppSettings,
  type ExperienceLog,
  type ImageDraft,
  type Ingredient,
  type ItemStatus,
  type ItemType,
  type StoredImage
} from '../types';
import { Spinner, STATUS_LABEL, TYPE_LABEL } from '../components/ui';

interface FormState {
  itemType: ItemType;
  title: string;
  sourceUrl: string;
  sourceName: string;
  status: ItemStatus;
  tags: string;
  memo: string;
  ocrText: string;
}

const emptyForm: FormState = {
  itemType: 'recipe',
  title: '',
  sourceUrl: '',
  sourceName: '',
  status: 'saved',
  tags: '',
  memo: '',
  ocrText: ''
};

export function EditorPage({
  itemId: existingId,
  settings,
  onSaved,
  onCancel
}: {
  itemId?: string;
  settings: AppSettings;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const initialDraftRef = useRef(loadDraft(existingId));
  const itemIdRef = useRef(existingId ?? newId());
  const [form, setForm] = useState<FormState>(initialDraftRef.current.form);
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [otherImages, setOtherImages] = useState<StoredImage[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialDraftRef.current.ingredients);
  const [existingLogs, setExistingLogs] = useState<ExperienceLog[]>([]);
  const [createdAt, setCreatedAt] = useState(new Date().toISOString());
  const [activeStep, setActiveStep] = useState<'info' | 'ocr' | 'ingredients'>('info');
  const [loading, setLoading] = useState(Boolean(existingId));
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const runnerRef = useRef<OcrRunner | null>(null);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    if (!existingId) return;
    void getItemBundle(existingId).then((bundle) => {
      if (!bundle) {
        setError('記録が見つかりません。');
        setLoading(false);
        return;
      }
      setForm({
        itemType: bundle.item.itemType,
        title: bundle.item.title,
        sourceUrl: bundle.item.sourceUrl,
        sourceName: bundle.item.sourceName,
        status: bundle.item.status,
        tags: bundle.item.tags.join(', '),
        memo: bundle.item.memo,
        ocrText: bundle.item.ocrText
      });
      setCreatedAt(bundle.item.createdAt);
      setIngredients(bundle.ingredients);
      setExistingLogs(bundle.logs);
      setOtherImages(bundle.images.filter((image) => image.imageType !== 'source'));
      setImages(
        bundle.images
          .filter((image) => image.imageType === 'source')
          .map((image) => {
            const previewUrl = URL.createObjectURL(image.blob);
            objectUrls.current.add(previewUrl);
            return {
              id: image.id,
              blob: image.blob,
              previewUrl,
              fileName: image.fileName,
              mimeType: image.mimeType,
              size: image.blob.size,
              originalSize: image.blob.size,
              convertedFromHeic: false,
              ocrText: image.ocrText,
              ocrStatus: image.ocrText ? 'done' : 'idle'
            };
          })
      );
      setLoading(false);
    });
  }, [existingId]);

  useEffect(() => {
    if (existingId || loading) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem('item-draft', JSON.stringify({ form, ingredients }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [existingId, form, ingredients, loading]);

  useEffect(
    () => () => {
      void runnerRef.current?.cancel();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = 5 - images.length;
    if (remaining <= 0) {
      setError('画像は5枚まで登録できます。');
      return;
    }
    setImageBusy(true);
    setError('');
    const next: ImageDraft[] = [];
    for (const file of Array.from(fileList).slice(0, remaining)) {
      try {
        const compressed = await compressImage(file, settings.imageQuality);
        const previewUrl = URL.createObjectURL(compressed.blob);
        objectUrls.current.add(previewUrl);
        next.push({
          id: newId(),
          blob: compressed.blob,
          previewUrl,
          fileName: replaceExtension(file.name, compressed.blob.type),
          mimeType: compressed.blob.type,
          size: compressed.blob.size,
          originalSize: compressed.originalSize,
          convertedFromHeic: compressed.convertedFromHeic,
          ocrText: '',
          ocrStatus: 'idle'
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '画像を追加できませんでした。');
      }
    }
    setImages((current) => [...current, ...next]);
    if (next.length) {
      const heicCount = next.filter((image) => image.convertedFromHeic).length;
      setNotice(
        heicCount
          ? `${next.length}枚を端末内で圧縮しました（HEIC／HEIF ${heicCount}枚を変換）。`
          : `${next.length}枚の画像を端末内で圧縮しました。`
      );
    }
    setImageBusy(false);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrls.current.delete(target.previewUrl);
      }
      const next = current.filter((image) => image.id !== id);
      setForm((value) => ({
        ...value,
        ocrText: next
          .map((image) => image.ocrText)
          .filter(Boolean)
          .join('\n\n')
      }));
      return next;
    });
  }

  async function runOcr() {
    if (!images.length) {
      setError('OCRする画像を先に追加してください。');
      return;
    }
    setError('');
    setNotice('');
    setActiveStep('ocr');
    setImages((current) => current.map((image) => ({ ...image, ocrStatus: 'running' })));
    const runner = new OcrRunner();
    runnerRef.current = runner;
    const resultMap = new Map(images.map((image) => [image.id, image.ocrText]));
    try {
      await runner.recognize(images, settings.ocrLanguage, setOcrProgress, (id, text) => {
        resultMap.set(id, text);
        setImages((current) =>
          current.map((image) =>
            image.id === id ? { ...image, ocrText: text, ocrStatus: 'done' } : image
          )
        );
        setForm((value) => ({
          ...value,
          ocrText: images
            .map((image) => resultMap.get(image.id) ?? '')
            .filter(Boolean)
            .join('\n\n')
        }));
      });
      setNotice('OCRが完了しました。原文を確認してから材料を抽出してください。');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'OCRに失敗しました。';
      setError(
        message.includes('worker')
          ? 'OCR処理に失敗しました。通信環境を確認して再試行してください。'
          : message
      );
      setImages((current) =>
        current.map((image) =>
          image.ocrStatus === 'running' ? { ...image, ocrStatus: 'error' } : image
        )
      );
    } finally {
      setOcrProgress(null);
      runnerRef.current = null;
    }
  }

  async function cancelOcr() {
    await runnerRef.current?.cancel();
    setOcrProgress(null);
    setError('OCRをキャンセルしました。読み取り済みの結果は残っています。');
  }

  function reExtract() {
    if (!form.ocrText.trim()) {
      setError('OCR原文が空です。原文を入力するか、OCRを実行してください。');
      return;
    }
    if (
      ingredients.length &&
      !window.confirm('現在の材料一覧を、OCR原文から再抽出した内容で置き換えますか？')
    )
      return;
    const extracted = extractIngredients(form.ocrText, itemIdRef.current);
    setIngredients(extracted);
    setActiveStep('ingredients');
    if (!extracted.length) setError('材料候補を抽出できませんでした。手入力で追加してください。');
    else setNotice(`${extracted.length}件の材料候補を抽出しました。内容を確認・修正してください。`);
  }

  function updateIngredient(id: string, field: keyof Ingredient, value: string | boolean) {
    setIngredients((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function addIngredient() {
    setIngredients((current) => [
      ...current,
      {
        id: newId(),
        itemId: itemIdRef.current,
        name: '',
        quantity: '',
        unit: '',
        note: '',
        groupName: '',
        sortOrder: current.length,
        included: true,
        sourceLine: ''
      }
    ]);
  }

  function moveIngredient(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= ingredients.length) return;
    setIngredients((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(destination, 0, moved);
      return next.map((row, sortOrder) => ({ ...row, sortOrder }));
    });
  }

  async function save() {
    setError('');
    if (!form.title.trim()) {
      setError('タイトルを入力してください。');
      setActiveStep('info');
      return;
    }
    if (form.sourceUrl && !isValidUrl(form.sourceUrl)) {
      setError('元URLが正しくありません。http:// または https:// から入力してください。');
      setActiveStep('info');
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await saveItemBundle({
        item: {
          id: itemIdRef.current,
          itemType: form.itemType,
          title: form.title.trim(),
          sourceUrl: form.sourceUrl.trim(),
          sourceName: form.sourceName.trim(),
          status: form.status,
          memo: form.memo.trim(),
          ocrText: form.ocrText,
          tags: parseTags(form.tags),
          createdAt,
          updatedAt: now
        },
        images: [
          ...images.map((image, sortOrder): StoredImage => ({
            id: image.id,
            itemId: itemIdRef.current,
            imageType: 'source',
            blob: image.blob,
            fileName: image.fileName,
            mimeType: image.mimeType,
            sortOrder,
            ocrText: image.ocrText,
            createdAt: now
          })),
          ...otherImages
        ],
        ingredients: ingredients.map((row, sortOrder) => ({
          ...row,
          itemId: itemIdRef.current,
          sortOrder
        })),
        logs: existingLogs
      });
      localStorage.removeItem('item-draft');
      onSaved(itemIdRef.current);
    } catch (reason) {
      const quota = reason instanceof DOMException && reason.name === 'QuotaExceededError';
      setError(
        quota
          ? '保存容量が不足しています。画像を減らすか、バックアップ後に不要な記録を削除してください。入力内容はこの画面に残っています。'
          : '保存に失敗しました。入力内容は残っているため、空き容量を確認して再試行してください。'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="page centered">
        <Spinner label="記録を読み込んでいます" />
      </div>
    );

  return (
    <div className="page editor-page">
      <div className="step-tabs" role="tablist">
        <button
          type="button"
          className={activeStep === 'info' ? 'active' : ''}
          onClick={() => setActiveStep('info')}
        >
          1 基本情報
        </button>
        <button
          type="button"
          className={activeStep === 'ocr' ? 'active' : ''}
          onClick={() => setActiveStep('ocr')}
        >
          2 OCR原文
        </button>
        <button
          type="button"
          className={activeStep === 'ingredients' ? 'active' : ''}
          onClick={() => setActiveStep('ingredients')}
        >
          3 材料確認
        </button>
      </div>
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

      {activeStep === 'info' && (
        <section className="form-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">BASIC INFORMATION</p>
              <h2>{existingId ? '記録を編集' : '新しい記録'}</h2>
            </div>
            <span>画像や内容は外部送信されません</span>
          </div>
          <div className="type-selector">
            {(['recipe', 'place', 'product'] as ItemType[]).map((value) => (
              <button
                type="button"
                key={value}
                className={form.itemType === value ? 'active' : ''}
                onClick={() => setForm({ ...form, itemType: value })}
              >
                {value === 'recipe' ? '♨' : value === 'place' ? '⌂' : '□'}
                <b>{TYPE_LABEL[value]}</b>
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label className="wide required">
              タイトル
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例：何度も作りたい親子丼"
              />
            </label>
            <label>
              元URL
              <input
                type="url"
                inputMode="url"
                value={form.sourceUrl}
                onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <label>
              出典名
              <input
                value={form.sourceName}
                onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                placeholder="サイト・チャンネル名"
              />
            </label>
            <label>
              状態
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ItemStatus })}
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              タグ
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="和食, 平日, 鶏肉"
              />
              <small>カンマまたは # で区切ります</small>
            </label>
            <label className="wide">
              メモ
              <textarea
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                rows={4}
                placeholder="作るときの注意、気になった点など"
              />
            </label>
          </div>

          <div className="upload-zone">
            <div>
              <p className="eyebrow">SOURCE IMAGES</p>
              <h3>スクリーンショット・写真</h3>
              <p>
                iPhone／iPadの写真アプリから最大5枚をまとめて選べます。HEIC／HEIFも端末内で変換し、長辺1600px以内に圧縮します。
              </p>
            </div>
            <div className="upload-actions">
              <label className="button secondary">
                写真を複数選ぶ
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="button ghost">
                カメラで撮る
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {imageBusy && <Spinner label="画像を圧縮しています" />}
          </div>
          {images.length > 0 && (
            <div className="image-draft-grid">
              {images.map((image, index) => (
                <article key={image.id}>
                  <img src={image.previewUrl} alt={`登録画像 ${index + 1}`} />
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    aria-label={`${index + 1}枚目を削除`}
                  >
                    ×
                  </button>
                  <div>
                    <b>{index + 1}枚目</b>
                    <span>
                      {formatBytes(image.size)}{' '}
                      <del>
                        {image.originalSize !== image.size ? formatBytes(image.originalSize) : ''}
                      </del>
                    </span>
                    {image.convertedFromHeic && <em>HEICから端末内変換</em>}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="ghost" onClick={onCancel}>
              キャンセル
            </button>
            <button type="button" className="secondary" onClick={() => setActiveStep('ocr')}>
              OCR原文へ進む
            </button>
            <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : 'この内容で保存'}
            </button>
          </div>
        </section>
      )}

      {activeStep === 'ocr' && (
        <section className="form-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ON-DEVICE OCR</p>
              <h2>OCR原文を確認</h2>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => void runOcr()}
              disabled={Boolean(ocrProgress)}
            >
              {ocrProgress ? '処理中…' : '画像をOCRする'}
            </button>
          </div>
          <div className="privacy-note">
            <b>初回のみ日本語モデルをダウンロードします</b>
            <span>読み取り処理と画像は端末内で完結します。初回OCRには通信が必要です。</span>
          </div>
          {ocrProgress && (
            <div className="ocr-progress">
              <div>
                <span>{ocrProgress.status}</span>
                <b>{Math.round(ocrProgress.progress * 100)}%</b>
              </div>
              <progress value={ocrProgress.progress} max="1" />
              <p>
                {ocrProgress.imageIndex + 1} / {ocrProgress.imageCount} 枚目
              </p>
              <button type="button" className="danger-link" onClick={() => void cancelOcr()}>
                キャンセル
              </button>
            </div>
          )}
          {images.map((image, index) => (
            <details className="ocr-image-result" key={image.id} open={image.ocrStatus === 'done'}>
              <summary>
                <span>
                  {index + 1}枚目：{image.fileName}
                </span>
                <b>
                  {image.ocrStatus === 'done'
                    ? '読取済み'
                    : image.ocrStatus === 'error'
                      ? 'エラー'
                      : '未読取'}
                </b>
              </summary>
              <textarea
                rows={8}
                value={image.ocrText}
                onChange={(e) => {
                  const text = e.target.value;
                  setImages((current) => {
                    const next = current.map((entry) =>
                      entry.id === image.id
                        ? { ...entry, ocrText: text, ocrStatus: 'done' as const }
                        : entry
                    );
                    setForm((value) => ({
                      ...value,
                      ocrText: next
                        .map((entry) => entry.ocrText)
                        .filter(Boolean)
                        .join('\n\n')
                    }));
                    return next;
                  });
                }}
                placeholder="この画像のOCR結果"
              />
            </details>
          ))}
          <label className="ocr-combined">
            結合したOCR原文
            <textarea
              rows={15}
              value={form.ocrText}
              onChange={(e) => setForm({ ...form, ocrText: e.target.value })}
              placeholder="OCRを使わず、ここへ手入力しても保存できます。"
            />
          </label>
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => setActiveStep('info')}>
              基本情報へ戻る
            </button>
            <button type="button" className="secondary" onClick={reExtract}>
              材料候補を抽出 →
            </button>
            <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </section>
      )}

      {activeStep === 'ingredients' && (
        <section className="form-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">REVIEW INGREDIENTS</p>
              <h2>材料候補を確認・修正</h2>
            </div>
            <span>自動抽出結果は保存前に必ず確認してください</span>
          </div>
          <div className="ingredient-toolbar">
            <button type="button" className="secondary" onClick={addIngredient}>
              ＋ 材料を追加
            </button>
            <button type="button" className="ghost" onClick={reExtract}>
              OCR原文から再抽出
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (
                  !ingredients.length ||
                  window.confirm('材料一覧を空にして手入力へ切り替えますか？')
                ) {
                  setIngredients([]);
                  addIngredient();
                }
              }}
            >
              すべて手入力
            </button>
          </div>
          <div className="ingredient-editor-list">
            {ingredients.map((row, index) => (
              <article key={row.id} className={!row.included ? 'excluded' : ''}>
                <div className="ingredient-row-head">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateIngredient(row.id, 'included', e.target.checked)}
                    />{' '}
                    保存対象
                  </label>
                  <div>
                    <button
                      type="button"
                      onClick={() => moveIngredient(index, -1)}
                      disabled={index === 0}
                      aria-label="上へ移動"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveIngredient(index, 1)}
                      disabled={index === ingredients.length - 1}
                      aria-label="下へ移動"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() =>
                        setIngredients((current) => current.filter((item) => item.id !== row.id))
                      }
                    >
                      削除
                    </button>
                  </div>
                </div>
                <div className="ingredient-fields">
                  <label className="name">
                    材料名
                    <input
                      value={row.name}
                      onChange={(e) => updateIngredient(row.id, 'name', e.target.value)}
                    />
                  </label>
                  <label>
                    数量
                    <input
                      value={row.quantity}
                      onChange={(e) => updateIngredient(row.id, 'quantity', e.target.value)}
                    />
                  </label>
                  <label>
                    単位
                    <input
                      value={row.unit}
                      onChange={(e) => updateIngredient(row.id, 'unit', e.target.value)}
                    />
                  </label>
                  <label>
                    グループ
                    <input
                      value={row.groupName}
                      onChange={(e) => updateIngredient(row.id, 'groupName', e.target.value)}
                    />
                  </label>
                  <label className="note">
                    補足
                    <input
                      value={row.note}
                      onChange={(e) => updateIngredient(row.id, 'note', e.target.value)}
                    />
                  </label>
                </div>
                {row.sourceLine && <p className="source-line">抽出元：{row.sourceLine}</p>}
              </article>
            ))}
            {!ingredients.length && (
              <p className="inline-empty">
                材料候補がありません。「材料を追加」から手入力できます。
              </p>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="ghost" onClick={() => setActiveStep('ocr')}>
              OCR原文へ戻る
            </button>
            <button type="button" className="primary" onClick={() => void save()} disabled={saving}>
              {saving ? '保存中…' : '確認して保存'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function loadDraft(existingId?: string): { form: FormState; ingredients: Ingredient[] } {
  if (existingId) return { form: emptyForm, ingredients: [] };
  try {
    const raw = localStorage.getItem('item-draft');
    if (!raw) return { form: emptyForm, ingredients: [] };
    const value = JSON.parse(raw) as { form?: Partial<FormState>; ingredients?: Ingredient[] };
    return { form: { ...emptyForm, ...value.form }, ingredients: value.ingredients ?? [] };
  } catch {
    return { form: emptyForm, ingredients: [] };
  }
}

function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,、#\n]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ];
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function replaceExtension(name: string, mimeType: string): string {
  const extension = mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${name.replace(/\.[^.]+$/, '')}.${extension}`;
}
