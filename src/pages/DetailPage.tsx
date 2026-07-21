import { useEffect, useState } from 'react';
import { deleteItem, getItemBundle, saveItemBundle } from '../db';
import { compressImage, formatBytes } from '../services/image';
import { newId, type AppSettings, type ItemBundle } from '../types';
import {
  BlobImage,
  EmptyState,
  formatDate,
  Rating,
  Spinner,
  STATUS_LABEL,
  TYPE_LABEL
} from '../components/ui';

export function DetailPage({
  itemId,
  settings,
  navigate,
  onChanged
}: {
  itemId: string;
  settings: AppSettings;
  navigate: (route: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [bundle, setBundle] = useState<ItemBundle>();
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
    async function load() {
      setBundle(await getItemBundle(itemId));
      setLoading(false);
    }
  }, [itemId]);

  async function remove() {
    if (!bundle) return;
    if (
      !window.confirm(
        `「${bundle.item.title}」を削除しますか？画像・材料・実施履歴も削除されます。`
      )
    )
      return;
    await deleteItem(bundle.item.id);
    await onChanged();
    navigate('home');
  }

  async function addLog(input: LogInput, photo?: File) {
    if (!bundle) return;
    setError('');
    try {
      const now = new Date().toISOString();
      const images = [...bundle.images];
      if (photo) {
        const compressed = await compressImage(photo, settings.imageQuality);
        images.push({
          id: newId(),
          itemId,
          imageType:
            bundle.item.itemType === 'recipe'
              ? 'completed'
              : bundle.item.itemType === 'place'
                ? 'visit'
                : 'purchase',
          blob: compressed.blob,
          fileName: photo.name,
          mimeType: compressed.blob.type,
          sortOrder: images.length,
          ocrText: '',
          createdAt: now
        });
      }
      const next: ItemBundle = {
        ...bundle,
        item: { ...bundle.item, status: 'completed', updatedAt: now },
        images,
        logs: [
          {
            id: newId(),
            itemId,
            experienceDate: input.date,
            rating: input.rating,
            comment: input.comment.trim(),
            cost: input.cost ? Number(input.cost) : null,
            wouldRepeat: input.wouldRepeat,
            improvementNote: input.improvement.trim(),
            createdAt: now
          },
          ...bundle.logs
        ]
      };
      await saveItemBundle(next);
      setBundle(next);
      setShowLogForm(false);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '実施記録を保存できませんでした。');
    }
  }

  if (loading)
    return (
      <div className="page centered">
        <Spinner label="記録を読み込んでいます" />
      </div>
    );
  if (!bundle)
    return (
      <div className="page">
        <EmptyState icon="?" title="記録が見つかりません">
          削除されたか、別の端末に保存されている可能性があります。
        </EmptyState>
      </div>
    );

  const { item, images, ingredients, logs } = bundle;
  const sourceImages = images.filter((image) => image.imageType === 'source');
  const experienceImages = images.filter((image) => image.imageType !== 'source');
  const includedIngredients = ingredients.filter((ingredient) => ingredient.included);
  const grouped = includedIngredients.reduce((map, ingredient) => {
    const groupName = ingredient.groupName || '材料';
    const rows = map.get(groupName) ?? [];
    rows.push(ingredient);
    map.set(groupName, rows);
    return map;
  }, new Map<string, typeof includedIngredients>());

  return (
    <div className="page detail-page">
      {error && <div className="message error">{error}</div>}
      <section className="detail-hero">
        <div className="detail-cover">
          {sourceImages[0] ? (
            <BlobImage blob={sourceImages[0].blob} alt={item.title} />
          ) : (
            <div className="image-placeholder">♨</div>
          )}
        </div>
        <div className="detail-intro">
          <div className="tag-row">
            <span className={`type-chip ${item.itemType}`}>{TYPE_LABEL[item.itemType]}</span>
            <span className={`status ${item.status}`}>{STATUS_LABEL[item.status]}</span>
          </div>
          <h2>{item.title}</h2>
          <p className="source-name">{item.sourceName || '出典未登録'}</p>
          <div className="tag-row">
            {item.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
          <div className="detail-actions">
            {item.sourceUrl && (
              <a
                className="button secondary"
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                元ページを開く ↗
              </a>
            )}
            <button
              type="button"
              className="button ghost"
              onClick={() => navigate(`edit/${item.id}`)}
            >
              編集
            </button>
          </div>
          <p className="record-dates">
            登録 {formatDate(item.createdAt)} ・ 更新 {formatDate(item.updatedAt)}
          </p>
        </div>
      </section>

      {sourceImages.length > 1 && (
        <section className="detail-section">
          <h3>登録画像</h3>
          <div className="gallery">
            {sourceImages.map((image, index) => (
              <BlobImage key={image.id} blob={image.blob} alt={`登録画像 ${index + 1}`} />
            ))}
          </div>
        </section>
      )}

      <div className="detail-columns">
        <section className="detail-section ingredients-view">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">INGREDIENTS</p>
              <h3>材料</h3>
            </div>
            <span>{includedIngredients.length}品</span>
          </div>
          {includedIngredients.length ? (
            [...grouped.entries()].map(([group, rows]) => (
              <div className="ingredient-group" key={group}>
                <h4>{group}</h4>
                {rows.map((row) => (
                  <div className="ingredient-view-row" key={row.id}>
                    <span>
                      {row.name}
                      {row.note && <small>{row.note}</small>}
                    </span>
                    <b>
                      {row.quantity}
                      {row.unit}
                    </b>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="muted">材料は登録されていません。</p>
          )}
        </section>
        <section className="detail-section">
          <p className="eyebrow">NOTES</p>
          <h3>メモ</h3>
          <p className="memo-text">{item.memo || 'メモはありません。'}</p>
          <details className="ocr-original">
            <summary>OCR原文を見る</summary>
            <pre>{item.ocrText || 'OCR原文はありません。'}</pre>
          </details>
        </section>
      </div>

      <section className="detail-section experience-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">EXPERIENCE LOG</p>
            <h3>
              {item.itemType === 'recipe'
                ? '作った記録'
                : item.itemType === 'place'
                  ? '訪問した記録'
                  : '購入した記録'}
            </h3>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => setShowLogForm((value) => !value)}
          >
            ＋ 記録を追加
          </button>
        </div>
        {showLogForm && (
          <ExperienceForm
            type={item.itemType}
            onSubmit={(input, photo) => void addLog(input, photo)}
            onCancel={() => setShowLogForm(false)}
          />
        )}
        {experienceImages.length > 0 && (
          <div className="experience-gallery">
            {experienceImages.map((image) => (
              <div key={image.id}>
                <BlobImage blob={image.blob} alt="実施写真" />
                <small>{formatBytes(image.blob.size)}</small>
              </div>
            ))}
          </div>
        )}
        {logs.length ? (
          <div className="timeline">
            {logs.map((log) => (
              <article key={log.id}>
                <div className="timeline-dot" />
                <div className="log-head">
                  <time>{formatDate(log.experienceDate)}</time>
                  <Rating value={log.rating} />
                </div>
                <p>{log.comment || 'コメントなし'}</p>
                <dl>
                  <div>
                    <dt>
                      また
                      {item.itemType === 'recipe'
                        ? '作りたい'
                        : item.itemType === 'place'
                          ? '行きたい'
                          : '買いたい'}
                    </dt>
                    <dd>{log.wouldRepeat ? 'はい' : 'いいえ'}</dd>
                  </div>
                  {log.cost !== null && (
                    <div>
                      <dt>費用</dt>
                      <dd>¥{log.cost.toLocaleString('ja-JP')}</dd>
                    </div>
                  )}
                  {log.improvementNote && (
                    <div>
                      <dt>次回の改善</dt>
                      <dd>{log.improvementNote}</dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="inline-empty">まだ実施記録はありません。</p>
        )}
      </section>
      <div className="danger-zone">
        <div>
          <b>この記録を削除</b>
          <p>画像・材料・実施履歴も端末から削除されます。</p>
        </div>
        <button type="button" className="danger" onClick={() => void remove()}>
          削除する
        </button>
      </div>
    </div>
  );
}

interface LogInput {
  date: string;
  rating: number;
  comment: string;
  cost: string;
  wouldRepeat: boolean;
  improvement: string;
}

function ExperienceForm({
  type,
  onSubmit,
  onCancel
}: {
  type: 'recipe' | 'place' | 'product';
  onSubmit: (input: LogInput, photo?: File) => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState<LogInput>({
    date: new Date().toISOString().slice(0, 10),
    rating: 3,
    comment: '',
    cost: '',
    wouldRepeat: true,
    improvement: ''
  });
  const [photo, setPhoto] = useState<File>();
  return (
    <form
      className="experience-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(input, photo);
      }}
    >
      <label>
        実施日
        <input
          required
          type="date"
          value={input.date}
          onChange={(e) => setInput({ ...input, date: e.target.value })}
        />
      </label>
      <label>
        評価
        <Rating value={input.rating} onChange={(rating) => setInput({ ...input, rating })} />
      </label>
      <label className="wide">
        一言コメント
        <textarea
          rows={3}
          value={input.comment}
          onChange={(e) => setInput({ ...input, comment: e.target.value })}
        />
      </label>
      <label>
        費用（円）
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={input.cost}
          onChange={(e) => setInput({ ...input, cost: e.target.value })}
        />
      </label>
      <label>
        {type === 'recipe' ? 'また作りたい' : type === 'place' ? 'また行きたい' : 'また買いたい'}
        <select
          value={input.wouldRepeat ? 'yes' : 'no'}
          onChange={(e) => setInput({ ...input, wouldRepeat: e.target.value === 'yes' })}
        >
          <option value="yes">はい</option>
          <option value="no">いいえ</option>
        </select>
      </label>
      <label className="wide">
        次回の改善点
        <textarea
          rows={3}
          value={input.improvement}
          onChange={(e) => setInput({ ...input, improvement: e.target.value })}
        />
      </label>
      <label className="wide">
        完成・訪問・購入写真
        <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0])} />
      </label>
      <div className="form-actions wide">
        <button type="button" className="ghost" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="primary">
          実施記録を保存
        </button>
      </div>
    </form>
  );
}
