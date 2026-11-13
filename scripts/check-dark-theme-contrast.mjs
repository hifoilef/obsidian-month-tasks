import { readFile } from 'node:fs/promises';
import path from 'node:path';

const source = await readFile(path.resolve(import.meta.dirname, '..', 'src', 'task-color.ts'), 'utf8');
const paletteBlock = /DEFAULT_TASK_COLOR_PALETTE\s*=\s*\[([\s\S]*?)\]/u.exec(source)?.[1] ?? '';
const colors = Array.from(paletteBlock.matchAll(/#[0-9a-f]{6}/giu), (match) => match[0].toLowerCase());
const background = '#202020';
const text = '#dcddde';

function rgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function mix(foreground, foregroundRatio, base) {
  const front = rgb(foreground);
  const back = rgb(base);
  const values = front.map((channel, index) => Math.round(
    channel * foregroundRatio + (back[index] ?? 0) * (1 - foregroundRatio),
  ));
  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex) {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const results = colors.map((color) => {
  const cardBackground = mix(color, 0.18, background);
  const barBackground = mix(color, 0.28, background);
  return {
    color,
    cardBackground,
    cardTextContrast: Number(contrast(text, cardBackground).toFixed(2)),
    barBackground,
    barTextContrast: Number(contrast(text, barBackground).toFixed(2)),
  };
});

console.log(JSON.stringify({
  assumptions: { background, text, requiredContrast: 4.5 },
  results,
  belowThreshold: results.filter((entry) => (
    entry.cardTextContrast < 4.5 || entry.barTextContrast < 4.5
  )),
}, null, 2));
