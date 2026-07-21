import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const COLORS = {
  coral: [232, 88, 62, 255],
  paper: [255, 250, 241, 255],
  ink: [38, 53, 47, 255],
  yellow: [246, 189, 74, 255]
};

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), createPng(size));
}

function createPng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      let color = COLORS.coral;
      if (insideRoundedRect(nx, ny, 0.22, 0.2, 0.78, 0.79, 0.065)) color = COLORS.paper;
      if (
        insideRoundedRect(nx, ny, 0.34, 0.36, 0.66, 0.4, 0.018) ||
        insideRoundedRect(nx, ny, 0.34, 0.47, 0.66, 0.51, 0.018) ||
        insideRoundedRect(nx, ny, 0.34, 0.58, 0.52, 0.62, 0.018)
      ) {
        color = COLORS.ink;
      }
      if (distance(nx, ny, 0.66, 0.65) <= 0.09) color = COLORS.yellow;
      if (
        distanceToSegment(nx, ny, 0.625, 0.65, 0.65, 0.675) <= 0.012 ||
        distanceToSegment(nx, ny, 0.65, 0.675, 0.705, 0.61) <= 0.012
      ) {
        color = COLORS.ink;
      }
      const offset = (y * size + x) * 4;
      pixels.set(color, offset);
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const closestX = Math.max(left + radius, Math.min(x, right - radius));
  const closestY = Math.max(top + radius, Math.min(y, bottom - radius));
  return (
    x >= left &&
    x <= right &&
    y >= top &&
    y <= bottom &&
    distance(x, y, closestX, closestY) <= radius
  );
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  return distance(x, y, x1 + t * dx, y1 + t * dy);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), data.length + 8);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
