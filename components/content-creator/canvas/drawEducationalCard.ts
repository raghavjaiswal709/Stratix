import type { PosterElement } from "../types";
import type { Rfn, EditorialTheme } from "./canvasUtils";
import {
  rrect,
  tokenizeHighlight,
  fitHighlightTitle,
  drawHighlightLines,
  tokenizeParagraphHighlights,
  wrapParagraphTokens,
  drawParagraphLines,
  computeCoverFitSlack,
  editorialPalette,
  getAntonFontFamily,
  HEADLINE_MIN_PX,
  HEADLINE_MAX_PX,
} from "./canvasUtils";


// Facts and Learnings share this one renderer — a Fact card and a Learning
// slide are the same shape (headline + body + image), just with different
// chrome text. Deliberately mirrors drawTradingNewsPoster's paper-band/photo
// composition for visual-family consistency across every Stratix carousel,
// but drops the impact badge and instrument ticker chips since neither
// category carries per-story market sentiment.
export function drawEducationalCard(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  kind: "facts" | "learnings",
  theme: EditorialTheme = "light",
  fadeIntensity: number = 100
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const isCover = !!data.isCover;
  const pal = { bg: "#10b981", fg: "#ffffff" };
  const th = editorialPalette(theme);
  const fadeMult = Math.max(0, Math.min(200, fadeIntensity)) / 100;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const PAD = r(30);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;

  const topBandH = Math.round(H * (isCover ? 0.58 : 0.44));
  const photoY = topBandH;
  const photoH = H - photoY;

  ctx.fillStyle = th.band;
  ctx.fillRect(0, 0, W, topBandH);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, r(5));

  let Y = r(34);

  // Eyebrow row
  const brandLabel = kind === "facts" ? "STRATIX FACTS" : "STRATIX LEARNINGS";
  if (isCover) {
    const label = kind === "facts" ? "TODAY'S FACTS" : "WHAT YOU'LL LEARN TODAY";
    ctx.font = `900 ${r(12)}px "Inter", sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + r(20), bh = r(26);
    ctx.fillStyle = pal.bg;
    rrect(ctx, CX, Y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, CX + r(10), Y + bh / 2 + r(0.5));
    bounds.push({ id: "category", label: "Eyebrow", x: CX, y: Y, w: bw, h: bh });
    Y += bh + r(18);
  } else {
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    ctx.fillStyle = th.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const eyebrow = data.stepLabel ? `${brandLabel}  ·  ${String(data.stepLabel).toUpperCase()}` : brandLabel;
    ctx.fillText(eyebrow, CX, Y + r(6));
    bounds.push({ id: "source", label: "Eyebrow", x: CX, y: Y - r(8), w: CW, h: r(20) });
    Y += r(24);
  }

  // Headline with highlighted phrase
  const rawTitle = (data.title || "Untitled").trim();
  const tokens = tokenizeHighlight(rawTitle, data.highlightPhrase || "");
  const afterEyebrowH = topBandH - Y;
  const headlineMaxH = isCover ? afterEyebrowH - r(20) : Math.round(afterEyebrowH * 0.5);
  const minFont = r(HEADLINE_MIN_PX);
  const maxFont = r(HEADLINE_MAX_PX);
  const fit = fitHighlightTitle(ctx, tokens, CW, Math.max(headlineMaxH, minFont * 1.2), minFont, maxFont, getAntonFontFamily(), "400", 1.04);
  drawHighlightLines(ctx, fit.lines, fit.font, fit.fontSize, fit.lineH, W / 2, Y, fit.fontSize * 0.26, pal, th.text);
  bounds.push({ id: "title", label: "Headline", x: CX, y: Y, w: CW, h: fit.lines.length * fit.lineH });
  Y += fit.lines.length * fit.lineH + r(12);

  if (!isCover) {
    const descText = (data.description || "").trim();
    if (descText) {
      const descNormalFont = `600 ${r(16)}px "Inter", sans-serif`;
      const descBoldFont = `800 ${r(16)}px "Inter", sans-serif`;
      const descLineH = r(21);
      const descTokens = tokenizeParagraphHighlights(descText, Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []);
      const allDescLines = wrapParagraphTokens(ctx, descTokens, CW, descNormalFont, descBoldFont);
      const maxDescLines = Math.max(2, Math.floor((topBandH - Y - r(14)) / descLineH));
      let descLines = allDescLines.slice(0, maxDescLines);
      if (allDescLines.length > maxDescLines && descLines.length > 0) {
        const lastLine = [...descLines[descLines.length - 1]];
        const lastTok = { ...lastLine[lastLine.length - 1] };
        lastTok.text = lastTok.text.replace(/[.,;:]+$/, "") + "…";
        lastLine[lastLine.length - 1] = lastTok;
        descLines = [...descLines.slice(0, -1), lastLine];
      }
      drawParagraphLines(ctx, descLines, descNormalFont, descBoldFont, descLineH, CX, Y, th.textSoft, pal.bg, "left");
      bounds.push({ id: "description", label: kind === "facts" ? "The Fact" : "Explanation", x: CX, y: Y, w: CW, h: descLines.length * descLineH });
      Y += descLines.length * descLineH + r(6);
    }
  }

  if (isCover) {
    const ovNormalFont = `600 ${r(15.5)}px "Inter", sans-serif`;
    const ovBoldFont = `800 ${r(15.5)}px "Inter", sans-serif`;
    const ovLineH = r(20);
    const ovTokens = tokenizeParagraphHighlights(data.description || "", Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []);
    const overviewLines = wrapParagraphTokens(ctx, ovTokens, CW * 0.92, ovNormalFont, ovBoldFont).slice(0, 3);
    drawParagraphLines(ctx, overviewLines, ovNormalFont, ovBoldFont, ovLineH, CX, Y, th.textSoft, pal.bg, "center", W / 2);
    bounds.push({ id: "description", label: "Overview", x: CX, y: Y, w: CW, h: overviewLines.length * ovLineH });
    Y += overviewLines.length * ovLineH + r(16);

    ctx.strokeStyle = th.divider;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CX, Y); ctx.lineTo(CXR, Y); ctx.stroke();
    Y += r(16);

    const bullets: string[] = Array.isArray(data.bulletHeadlines) ? data.bulletHeadlines.slice(0, 6) : [];
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const bulletFont = `700 ${r(13.5)}px "Inter", sans-serif`;
    const bulletMaxY = topBandH - r(14);
    for (const headline of bullets) {
      if (Y + r(22) > bulletMaxY) break;
      ctx.fillStyle = pal.bg;
      ctx.beginPath(); ctx.arc(CX + r(4), Y + r(11), r(3.5), 0, Math.PI * 2); ctx.fill();
      ctx.font = bulletFont;
      ctx.fillStyle = th.bullet;
      let text = headline;
      while (ctx.measureText(text).width > CW - r(20) && text.length > 4) text = text.slice(0, -1);
      if (text !== headline) text = text.slice(0, -1) + "…";
      ctx.fillText(text, CX + r(14), Y + r(11));
      Y += r(24);
    }
  }

  // ── Photo area ───────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoY, W, photoH);
  ctx.clip();

  if (img) {
    const iAR = img.naturalWidth / img.naturalHeight;
    const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
    const { slackX, slackY } = computeCoverFitSlack(iAR, W, photoH, zoom);
    const fAR = W / photoH;
    let baseW = W, baseH = photoH;
    if (iAR > fAR) { baseH = photoH; baseW = photoH * iAR; }
    else { baseW = W; baseH = W / iAR; }
    const dw = baseW * zoom, dh = baseH * zoom;
    const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
    const dx = -slackX * focusX;
    const dy = photoY - slackY * focusY;
    ctx.drawImage(img, dx, dy, dw, dh);

    // Long, slow dissolve — spans most of the photo height so the band color
    // bleeds gradually all the way down, never reading as a hard-edged cut.
    const fadeH = Math.round(photoH * 0.82);
    const fade = ctx.createLinearGradient(0, photoY, 0, photoY + fadeH);
    fade.addColorStop(0,    `rgba(${th.bandRgb},${1 * fadeMult})`);
    fade.addColorStop(0.14, `rgba(${th.bandRgb},${0.92 * fadeMult})`);
    fade.addColorStop(0.32, `rgba(${th.bandRgb},${0.68 * fadeMult})`);
    fade.addColorStop(0.52, `rgba(${th.bandRgb},${0.42 * fadeMult})`);
    fade.addColorStop(0.72, `rgba(${th.bandRgb},${0.22 * fadeMult})`);
    fade.addColorStop(0.88, `rgba(${th.bandRgb},${0.08 * fadeMult})`);
    fade.addColorStop(1,    `rgba(${th.bandRgb},0)`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, photoY, W, fadeH);
  } else {
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, photoY, W, photoH);
    ctx.font = `700 ${r(13)}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("[ PLACE IMAGE HERE — see Grok prompt ]", W / 2, photoY + photoH / 2);
  }

  const scrim = ctx.createLinearGradient(0, H - photoH * 0.42, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H - photoH * 0.42, W, photoH * 0.42);

  // Related-instrument chips (Facts only, optional) — plain, no sentiment
  // arrows, since these are structural facts, not directional calls.
  if (!isCover && kind === "facts" && Array.isArray(data.relatedInstruments) && data.relatedInstruments.length > 0) {
    let chipX = CX;
    const chipY = photoY + r(16);
    const chipH = r(24);
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    for (const symbol of (data.relatedInstruments as string[]).slice(0, 4)) {
      if (!symbol) continue;
      const tw = ctx.measureText(symbol).width;
      const chipW = tw + r(18);
      ctx.fillStyle = "rgba(16,185,129,0.85)";
      rrect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(symbol, chipX + r(9), chipY + chipH / 2 + r(0.5));
      chipX += chipW + r(8);
    }
  }

  ctx.restore();
  bounds.push({ id: "imageUrl", label: kind === "facts" ? "Fact Image" : "Slide Image", x: 0, y: photoY, w: W, h: photoH });

  // ── Carousel chrome over the photo ──────────────────────────────────
  const chromeY = H - r(30);

  const badgeText = isCover
    ? (kind === "facts" ? "TODAY'S FACTS" : "TODAY'S LESSON")
    : (data.stepLabel || `#${Math.max(1, activeIndex)}`);
  ctx.font = `900 ${r(13)}px "Inter", sans-serif`;
  const badgeTw = ctx.measureText(badgeText).width;
  const badgeW = badgeTw + r(20), badgeH = r(28);
  ctx.fillStyle = pal.bg;
  rrect(ctx, CX, chromeY - badgeH / 2, badgeW, badgeH, r(6));
  ctx.fill();
  ctx.fillStyle = pal.fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, CX + r(10), chromeY + r(0.5));

  ctx.font = `900 ${r(13)}px "Inter", sans-serif`;
  const xW = ctx.measureText("X").width;
  ctx.textAlign = "right";
  ctx.fillStyle = "#10b981";
  ctx.fillText("X", CXR, chromeY + r(0.5));
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("STRATI", CXR - xW, chromeY + r(0.5));

  if (totalCount > 1) {
    const dotSpacing = r(11);
    const totalDotsW = (totalCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    for (let i = 0; i < totalCount; i++) {
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, chromeY, r(2.6), 0, Math.PI * 2);
      ctx.fillStyle = i === activeIndex ? "#FFFFFF" : "rgba(255,255,255,0.32)";
      ctx.fill();
    }
  }

  return bounds;
}
