/**
 * Client-side share card: a 1200×630 canvas in the phosphor-terminal palette,
 * downloaded as a PNG. Rendered entirely in the browser — nothing uploads.
 */

export interface ShareCardData {
  tagline: string;
  xpLine: string;
  coreLine: string;
  bonusLine: string | null;
  hintFreeLine: string | null;
  badges: { label: string; earned: boolean }[];
  footer: string;
}

const PALETTE = {
  bg: '#0a0f0d',
  panel: '#101613',
  line: '#22302a',
  ink: '#e8f3ec',
  dim: '#9db4a8',
  phosphor: '#4ade80',
  amber: '#fbbf24',
} as const;

const MONO = '"IBM Plex Mono", ui-monospace, monospace';

export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData): void {
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, 1200, 630);

  // faint circuit grid, echoing the world map
  ctx.strokeStyle = PALETTE.line;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (let x = 60; x < 1200; x += 95) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  for (let y = 55; y < 630; y += 95) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // frame
  ctx.strokeStyle = PALETTE.phosphor;
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, 1120, 550);
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(42, 42, 1116, 546);

  // title
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `bold 72px ${MONO}`;
  ctx.fillText('Token', 90, 160);
  ctx.fillStyle = PALETTE.phosphor;
  ctx.fillText('_', 90 + ctx.measureText('Token').width, 160);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText('Arena', 90 + ctx.measureText('Token_').width, 160);

  ctx.fillStyle = PALETTE.dim;
  ctx.font = `24px ${MONO}`;
  ctx.fillText(data.tagline, 90, 205);

  // stats
  ctx.fillStyle = PALETTE.phosphor;
  ctx.font = `bold 44px ${MONO}`;
  ctx.fillText(`▲ ${data.xpLine}`, 90, 290);

  ctx.fillStyle = PALETTE.ink;
  ctx.font = `28px ${MONO}`;
  let statY = 345;
  ctx.fillText(data.coreLine, 90, statY);
  if (data.bonusLine) {
    statY += 42;
    ctx.fillStyle = PALETTE.amber;
    ctx.fillText(data.bonusLine, 90, statY);
  }
  if (data.hintFreeLine) {
    statY += 42;
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(data.hintFreeLine, 90, statY);
  }

  // badge chips
  ctx.font = `22px ${MONO}`;
  let x = 90;
  let y = 505;
  for (const badge of data.badges) {
    const text = badge.earned ? `▣ ${badge.label}` : `▢ ${badge.label}`;
    const width = ctx.measureText(text).width + 36;
    if (x + width > 1110) {
      x = 90;
      y += 52;
      if (y > 560) break;
    }
    ctx.strokeStyle = badge.earned ? PALETTE.phosphor : PALETTE.line;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y - 32, width, 44);
    ctx.fillStyle = badge.earned ? PALETTE.phosphor : PALETTE.dim;
    ctx.fillText(text, x + 18, y);
    x += width + 16;
  }

  // footer
  ctx.fillStyle = PALETTE.dim;
  ctx.font = `20px ${MONO}`;
  const footerWidth = ctx.measureText(data.footer).width;
  ctx.fillText(data.footer, 1160 - footerWidth, 570);
}

export async function downloadShareCard(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  await document.fonts.ready;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
