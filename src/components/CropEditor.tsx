import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  FULL_CROP,
  isFullCrop,
  moveCropRect,
  resizeCropRect,
  type CropHandle
} from '../services/ocrPreprocess';
import type { CropRect } from '../types';

interface DragState {
  kind: 'move' | CropHandle;
  pointerId: number;
  startX: number;
  startY: number;
  crop: CropRect;
}

export function CropEditor({
  imageUrl,
  crop,
  label,
  disabled,
  onChange
}: {
  imageUrl: string;
  crop: CropRect | null;
  label: string;
  disabled: boolean;
  onChange: (crop: CropRect | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 4, height: 3 });
  const value = crop ?? FULL_CROP;

  function beginDrag(event: ReactPointerEvent<HTMLElement>, kind: DragState['kind']) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      crop: value
    };
  }

  function continueDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !bounds?.width || !bounds.height) return;
    event.preventDefault();
    const dx = (event.clientX - drag.startX) / bounds.width;
    const dy = (event.clientY - drag.startY) / bounds.height;
    const next =
      drag.kind === 'move'
        ? moveCropRect(drag.crop, dx, dy)
        : resizeCropRect(drag.crop, drag.kind, dx, dy);
    onChange(isFullCrop(next) ? null : next);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  const commonPointerHandlers = {
    onPointerMove: continueDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag
  };

  return (
    <div className="crop-editor">
      <div className="crop-instructions">
        <div>
          <b>OCRの読み取り範囲</b>
          <span>枠内だけを読み取ります。枠または四隅をドラッグしてください。</span>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => onChange(null)}
          disabled={!crop || disabled}
        >
          元画像へ戻す
        </button>
      </div>
      <div
        ref={stageRef}
        className="crop-stage"
        style={{
          aspectRatio: `${naturalSize.width} / ${naturalSize.height}`,
          width: `min(100%, 720px, ${(72 * naturalSize.width) / naturalSize.height}vh)`
        }}
      >
        <img
          src={imageUrl}
          alt={`${label}の読み取り範囲指定`}
          draggable={false}
          onLoad={(event) =>
            setNaturalSize({
              width: event.currentTarget.naturalWidth || 4,
              height: event.currentTarget.naturalHeight || 3
            })
          }
        />
        <div
          className="crop-frame"
          style={{
            left: `${value.x * 100}%`,
            top: `${value.y * 100}%`,
            width: `${value.width * 100}%`,
            height: `${value.height * 100}%`
          }}
          onPointerDown={(event) => beginDrag(event, 'move')}
          {...commonPointerHandlers}
        >
          {(['nw', 'ne', 'sw', 'se'] as CropHandle[]).map((handle) => (
            <button
              type="button"
              key={handle}
              className={`crop-handle ${handle}`}
              aria-label={`${cornerLabel(handle)}をドラッグ`}
              onPointerDown={(event) => beginDrag(event, handle)}
              {...commonPointerHandlers}
            />
          ))}
        </div>
      </div>
      <div className="crop-preview-row">
        <div>
          <b>切り抜きプレビュー</b>
          <span>{crop ? 'この範囲をOCRします' : '範囲指定なし（画像全体）'}</span>
        </div>
        <div
          className="crop-preview"
          style={{
            aspectRatio: `${value.width * naturalSize.width} / ${value.height * naturalSize.height}`
          }}
        >
          <img
            src={imageUrl}
            alt={`${label}の切り抜きプレビュー`}
            draggable={false}
            style={{
              width: `${100 / value.width}%`,
              height: 'auto',
              left: `${(-value.x / value.width) * 100}%`,
              top: `${(-value.y / value.height) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}

function cornerLabel(handle: CropHandle): string {
  const labels: Record<CropHandle, string> = {
    nw: '左上',
    ne: '右上',
    sw: '左下',
    se: '右下'
  };
  return labels[handle];
}
