import type { PosterColors, PosterConfig, PosterElement, PosterData } from "../types";
import type { FontFns, Rfn } from "./canvasUtils";
import { rrect, wrap } from "./canvasUtils";


export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  data: PosterData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  let Y = PAD + GUT;

  // ── Ghost index number (editorial depth behind title)
  if (data.index) {
    ctx.save();
    ctx.font = `bold ${r(200)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.accent + "09";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(String(data.index).padStart(2, "0"), CXR, Y - r(10));
    ctx.restore();
  }

  // ── Category badge (solid accent fill, white text)
  const catLabel = (data.category || "CONTENT").toUpperCase();
  ctx.font = font.label(8.5); ctx.textBaseline = "middle";
  const catTW = ctx.measureText(catLabel).width;
  const badgeW = catTW + r(18), badgeH = r(22), badgeR = r(3);
  rrect(ctx, CX, Y, badgeW, badgeH, badgeR);
  ctx.fillStyle = colors.accent; ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(catLabel, CX + r(9), Y + badgeH / 2);
  ctx.textBaseline = "top";

  if (data.index || data.date) {
    const parts = [data.index ? `NO. ${data.index}` : "", data.date || ""].filter(Boolean).join("  ·  ");
    ctx.font = font.label(9); ctx.fillStyle = colors.muted;
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(parts, CXR, Y + r(5));
  }
  bounds.push({ id: "category", label: "Category & Index", x: CX, y: Y, w: CW, h: badgeH });
  Y += badgeH + r(18);

  // ── Bold orange divider
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, Y + 0.5); ctx.lineTo(CXR, Y + 0.5); ctx.stroke();
  Y += r(26);

  // ── Title (large bold serif — hero element)
  const titleY = Y;
  ctx.font = font.serif(46, true); ctx.fillStyle = colors.text;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const tLines = wrap(ctx, data.title || "Untitled", CW);
  const tLH = r(56 * config.fontScale);
  tLines.forEach((l, i) => ctx.fillText(l, CX, Y + i * tLH));
  const titleH = Math.max(tLines.length * tLH, r(24));
  bounds.push({ id: "title", label: "Title", x: CX, y: titleY, w: CW, h: titleH });
  Y += titleH + r(8);

  // ── Subtitle (italic serif)
  if (data.subtitle) {
    const subY = Y;
    ctx.font = `italic ${r(16 * config.fontScale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.muted; ctx.textBaseline = "top";
    ctx.fillText(data.subtitle, CX, Y);
    bounds.push({ id: "subtitle", label: "Subtitle", x: CX, y: subY, w: CW, h: r(26) });
    Y += r(28);
  }

  // ── Tags (pill badges — rounded, bordered)
  if (data.tags?.length) {
    Y += r(6);
    const tagsY = Y;
    ctx.font = font.label(8);
    const tH = r(22), tPX = r(10), tGap = r(6), tR = r(11);
    let tX = CX; ctx.textBaseline = "middle";
    for (const tag of data.tags) {
      const tw = ctx.measureText(tag).width + tPX * 2;
      if (tX + tw > CXR) break;
      rrect(ctx, tX, Y, tw, tH, tR);
      ctx.fillStyle = colors.accent + "20"; ctx.fill();
      ctx.strokeStyle = colors.accent + "88"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = colors.accent; ctx.textAlign = "left";
      ctx.fillText(tag, tX + tPX, Y + tH / 2);
      tX += tw + tGap;
    }
    ctx.textBaseline = "top";
    bounds.push({ id: "tags", label: "Tags", x: CX, y: tagsY, w: CW, h: tH });
    Y += tH + r(18);
  }

  // ── Thin secondary separator
  ctx.strokeStyle = colors.accent + "45"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX, Y + 0.5); ctx.lineTo(CXR, Y + 0.5); ctx.stroke();
  Y += r(18);

  // ── Description card (orange top-stripe + card fill)
  if (data.description) {
    const descY = Y;
    ctx.font = font.body(12.5);
    const dLines = wrap(ctx, data.description, CW - r(26));
    const dLH = r(20);
    const cardPX = r(18), cardPY = r(16);
    const cardH = dLines.length * dLH + cardPY * 2;
    rrect(ctx, CX, Y, CW, cardH, r(6));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
    // Orange top stripe (clipped to card shape)
    ctx.save();
    rrect(ctx, CX, Y, CW, cardH, r(6)); ctx.clip();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(CX, Y, CW, r(3));
    ctx.restore();
    ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
    dLines.forEach((l, i) => ctx.fillText(l, CX + cardPX, Y + cardPY + i * dLH));
    bounds.push({ id: "description", label: "Description", x: CX, y: descY, w: CW, h: cardH });
    Y += cardH + r(18);
  }

  // ── Sections (orange dot bullet + label + body)
  if (data.sections?.length) {
    const secY = Y;
    let secHSum = 0;
    for (const sec of data.sections) {
      const curY = Y + secHSum;
      // Dot bullet
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(CX + r(4), curY + r(5.5), r(3), 0, Math.PI * 2); ctx.fill();
      // Label
      ctx.font = font.label(9); ctx.fillStyle = colors.accent;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(sec.label.toUpperCase(), CX + r(14), curY + r(0.5));
      // Body
      ctx.font = font.body(12.5); ctx.fillStyle = colors.text + "E8";
      const sLines = wrap(ctx, sec.content, CW - r(12));
      const sLH = r(19);
      sLines.forEach((l, i) => ctx.fillText(l, CX + r(10), curY + r(17) + i * sLH));
      secHSum += r(17) + sLines.length * sLH + r(14);
    }
    bounds.push({ id: "sections", label: "Sections", x: CX, y: secY, w: CW, h: secHSum });
    Y += secHSum + r(4);
  }

  // ── Formula card (dashed orange border)
  if (data.formula) {
    const formulaY = Y;
    const fPX = r(16), fPY = r(14);
    const fH = fPY + r(14) + r(6) + r(22) + fPY;
    rrect(ctx, CX, Y, CW, fH, r(6));
    ctx.fillStyle = colors.subtle; ctx.fill();
    ctx.setLineDash([r(4), r(3)]);
    ctx.strokeStyle = colors.accent + "AA"; ctx.lineWidth = 1.5;
    rrect(ctx, CX, Y, CW, fH, r(6)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font.label(8); ctx.fillStyle = colors.accent;
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText("FORMULA", CX + fPX, Y + fPY);
    ctx.font = font.serif(16); ctx.fillStyle = colors.text;
    ctx.textBaseline = "top";
    ctx.fillText(data.formula, CX + fPX, Y + fPY + r(14) + r(6));
    bounds.push({ id: "formula", label: "Formula Box", x: CX, y: formulaY, w: CW, h: fH });
    Y += fH + r(18);
  }

  // ── Metrics grid (orange dot accent, bold serif values)
  if (data.metrics?.length) {
    const metricsY = Y;
    const mets = data.metrics.slice(0, 4);
    const cols = mets.length <= 2 ? mets.length : 2;
    const mGap = r(9), mH = r(68), mR = r(6);
    const mW = (CW - mGap * (cols - 1)) / cols;
    mets.forEach((m, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const mx = CX + col * (mW + mGap), my = Y + row * (mH + mGap);
      rrect(ctx, mx, my, mW, mH, mR);
      ctx.fillStyle = colors.card; ctx.fill();
      ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
      // Orange dot accent
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(mx + r(13), my + r(13), r(2.5), 0, Math.PI * 2); ctx.fill();
      // Label (monospace, muted)
      ctx.font = font.label(8); ctx.fillStyle = colors.muted;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(m.label.toUpperCase(), mx + r(23), my + r(9));
      // Value (bold serif, full brightness)
      ctx.font = font.serif(20, true); ctx.fillStyle = colors.text;
      ctx.textBaseline = "bottom";
      ctx.fillText(m.value, mx + r(12), my + mH - r(12));
    });
    const metricsH = Math.ceil(mets.length / cols) * (mH + mGap);
    bounds.push({ id: "metrics", label: "Metrics Grid", x: CX, y: metricsY, w: CW, h: metricsH });
    Y += metricsH + r(10);
  }

  // ── Image
  if (img) {
    const avail = H - PAD - GUT - Y - r(44);
    if (avail > r(50)) {
      const iH = Math.min(avail, r(190));
      const iAR = img.naturalWidth / img.naturalHeight;
      const iW = Math.min(CW, iH * iAR);
      const iX = CX + (CW - iW) / 2;
      ctx.save();
      rrect(ctx, CX, Y, CW, iH, r(6)); ctx.clip();
      ctx.drawImage(img, iX, Y, iW, iH);
      ctx.restore();
      bounds.push({ id: "imageUrl", label: "Image Frame", x: CX, y: Y, w: CW, h: iH });
    }
  }

  // ── Footer
  const FY = H - PAD - GUT;
  ctx.strokeStyle = colors.accent + "40"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(16) + 0.5); ctx.lineTo(CXR, FY - r(16) + 0.5); ctx.stroke();
  ctx.font = font.label(9); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(7));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent + "CC";
  ctx.fillText("stratix.app", CXR, FY - r(7));
  bounds.push({ id: "footer", label: "Footer Website", x: CX, y: FY - r(16), w: CW, h: r(28) });

  return bounds;
}

// ─── Landscape (16:9) two-column layout ──────────────────────────────────────

export function drawLandscape(
  ctx: CanvasRenderingContext2D,
  data: PosterData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const COL_GAP = r(32);
  const LC = Math.round(CW * 0.48);
  const RC = CW - LC - COL_GAP;
  const RCX = CX + LC + COL_GAP;

  let LY = PAD + GUT, RY = PAD + GUT;

  // ── Left: ghost index
  if (data.index) {
    ctx.save();
    ctx.font = `bold ${r(150)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.accent + "09";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(String(data.index).padStart(2, "0"), CX + LC, LY - r(5));
    ctx.restore();
  }

  // ── Left: category badge
  const catLabel = (data.category || "CONTENT").toUpperCase();
  ctx.font = font.label(8.5); ctx.textBaseline = "middle";
  const catTW = ctx.measureText(catLabel).width;
  const badgeW = catTW + r(18), badgeH = r(22), badgeR = r(3);
  rrect(ctx, CX, LY, badgeW, badgeH, badgeR);
  ctx.fillStyle = colors.accent; ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(catLabel, CX + r(9), LY + badgeH / 2);
  ctx.textBaseline = "top";

  if (data.index || data.date) {
    const parts = [data.index ? `NO. ${data.index}` : "", data.date || ""].filter(Boolean).join("  ·  ");
    ctx.font = font.label(9); ctx.fillStyle = colors.muted;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(parts, CX, LY + badgeH + r(5));
    LY += r(14);
  }
  bounds.push({ id: "category", label: "Category & Index", x: CX, y: LY, w: LC, h: badgeH });
  LY += badgeH + r(16);

  // Rule
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, LY + 0.5); ctx.lineTo(CX + LC, LY + 0.5); ctx.stroke();
  LY += r(22);

  // Title
  const titleY = LY;
  ctx.font = font.serif(38, true); ctx.fillStyle = colors.text;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const tLines = wrap(ctx, data.title || "Untitled", LC);
  const tLH = r(46 * config.fontScale);
  tLines.forEach((l, i) => ctx.fillText(l, CX, LY + i * tLH));
  const titleH = Math.max(tLines.length * tLH, r(20));
  bounds.push({ id: "title", label: "Title", x: CX, y: titleY, w: LC, h: titleH });
  LY += titleH + r(8);

  // Subtitle
  if (data.subtitle) {
    const subY = LY;
    ctx.font = `italic ${r(13 * config.fontScale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.muted; ctx.textBaseline = "top";
    ctx.fillText(data.subtitle, CX, LY);
    bounds.push({ id: "subtitle", label: "Subtitle", x: CX, y: subY, w: LC, h: r(22) });
    LY += r(24);
  }

  // Tags
  if (data.tags?.length) {
    LY += r(4);
    const tagsY = LY;
    ctx.font = font.label(8);
    const tH = r(20), tPX = r(9), tGap = r(5), tR = r(10);
    let tX = CX; ctx.textBaseline = "middle";
    for (const tag of data.tags) {
      const tw = ctx.measureText(tag).width + tPX * 2;
      if (tX + tw > CX + LC) break;
      rrect(ctx, tX, LY, tw, tH, tR);
      ctx.fillStyle = colors.accent + "20"; ctx.fill();
      ctx.strokeStyle = colors.accent + "88"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = colors.accent; ctx.textAlign = "left";
      ctx.fillText(tag, tX + tPX, LY + tH / 2);
      tX += tw + tGap;
    }
    ctx.textBaseline = "top";
    bounds.push({ id: "tags", label: "Tags", x: CX, y: tagsY, w: LC, h: tH });
    LY += tH + r(14);
  }

  // Description card
  if (data.description) {
    const descY = LY;
    ctx.font = font.body(11.5);
    const dLines = wrap(ctx, data.description, LC - r(22));
    const dLH = r(18);
    const cardPX = r(16), cardPY = r(14);
    const cardH = dLines.length * dLH + cardPY * 2;
    rrect(ctx, CX, LY, LC, cardH, r(6));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    rrect(ctx, CX, LY, LC, cardH, r(6)); ctx.clip();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(CX, LY, LC, r(3));
    ctx.restore();
    ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
    dLines.forEach((l, i) => ctx.fillText(l, CX + cardPX, LY + cardPY + i * dLH));
    bounds.push({ id: "description", label: "Description", x: CX, y: descY, w: LC, h: cardH });
    LY += cardH + r(14);
  }

  // Formula (left col, dashed border)
  if (data.formula) {
    const formulaY = LY;
    const fPX = r(14), fPY = r(12);
    const fH = fPY + r(12) + r(6) + r(20) + fPY;
    rrect(ctx, CX, LY, LC, fH, r(6));
    ctx.fillStyle = colors.subtle; ctx.fill();
    ctx.setLineDash([r(4), r(3)]);
    ctx.strokeStyle = colors.accent + "AA"; ctx.lineWidth = 1.5;
    rrect(ctx, CX, LY, LC, fH, r(6)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font.label(8); ctx.fillStyle = colors.accent;
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText("FORMULA", CX + fPX, LY + fPY);
    ctx.font = font.serif(13); ctx.fillStyle = colors.text;
    ctx.textBaseline = "top";
    ctx.fillText(data.formula, CX + fPX, LY + fPY + r(12) + r(6));
    bounds.push({ id: "formula", label: "Formula Box", x: CX, y: formulaY, w: LC, h: fH });
  }

  // ── Dashed vertical separator
  ctx.strokeStyle = colors.accent + "40"; ctx.lineWidth = 1;
  ctx.setLineDash([r(4), r(4)]);
  const sepX = CX + LC + COL_GAP / 2;
  ctx.beginPath();
  ctx.moveTo(sepX + 0.5, PAD + GUT);
  ctx.lineTo(sepX + 0.5, H - PAD - GUT);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Right column: Sections
  if (data.sections?.length) {
    const secY = RY;
    let secHSum = 0;
    for (const sec of data.sections) {
      const curY = RY + secHSum;
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(RCX + r(4), curY + r(5.5), r(3), 0, Math.PI * 2); ctx.fill();
      ctx.font = font.label(9); ctx.fillStyle = colors.accent;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(sec.label.toUpperCase(), RCX + r(14), curY + r(0.5));
      ctx.font = font.body(11.5); ctx.fillStyle = colors.text + "E8";
      const sLines = wrap(ctx, sec.content, RC - r(10));
      const sLH = r(18);
      sLines.forEach((l, i) => ctx.fillText(l, RCX + r(10), curY + r(17) + i * sLH));
      secHSum += r(17) + sLines.length * sLH + r(14);
    }
    bounds.push({ id: "sections", label: "Sections", x: RCX, y: secY, w: RC, h: secHSum });
    RY += secHSum + r(8);
  }

  // Right: Metrics (orange dot accent)
  if (data.metrics?.length) {
    const metricsY = RY;
    const mets = data.metrics.slice(0, 4);
    const cols = Math.min(mets.length, 2);
    const mGap = r(8), mH = r(62), mR = r(6);
    const mW = (RC - mGap * (cols - 1)) / cols;
    mets.forEach((m, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const mx = RCX + col * (mW + mGap), my = RY + row * (mH + mGap);
      rrect(ctx, mx, my, mW, mH, mR);
      ctx.fillStyle = colors.card; ctx.fill();
      ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(mx + r(12), my + r(12), r(2.5), 0, Math.PI * 2); ctx.fill();
      ctx.font = font.label(8); ctx.fillStyle = colors.muted;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(m.label.toUpperCase(), mx + r(22), my + r(8));
      ctx.font = font.serif(18, true); ctx.fillStyle = colors.text;
      ctx.textBaseline = "bottom";
      ctx.fillText(m.value, mx + r(11), my + mH - r(11));
    });
    const metricsH = Math.ceil(mets.length / cols) * (mH + mGap);
    bounds.push({ id: "metrics", label: "Metrics Grid", x: RCX, y: metricsY, w: RC, h: metricsH });
  }

  // Footer (full width)
  const FY = H - PAD - GUT;
  ctx.strokeStyle = colors.accent + "40"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(16) + 0.5); ctx.lineTo(CXR, FY - r(16) + 0.5); ctx.stroke();
  ctx.font = font.label(9); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(7));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent + "CC";
  ctx.fillText("stratix.app", CXR, FY - r(7));
  bounds.push({ id: "footer", label: "Footer Website", x: CX, y: FY - r(16), w: CW, h: r(28) });

  return bounds;
}
