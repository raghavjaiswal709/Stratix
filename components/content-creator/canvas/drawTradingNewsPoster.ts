import type { PosterElement } from "../types";
import type { Rfn, SentimentScheme, EditorialTheme } from "./canvasUtils";
import {
  rrect,
  sentimentPalette,
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


export function drawTradingNewsPoster(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeNewsIndex: number,
  totalNewsCount: number,
  theme: EditorialTheme = "light",
  fadeIntensity: number = 100,
  sentimentScheme: SentimentScheme = "emerald"
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const isCover = !!data.isCover;
  const fadeMult = Math.max(0, Math.min(200, fadeIntensity)) / 100;
  const pal = sentimentPalette(data.sentiment, sentimentScheme);
  const th = editorialPalette(theme);

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const PAD = r(30);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;

  const topBandH = Math.round(H * (isCover ? 0.58 : 0.44));
  const photoY = topBandH;
  const photoH = H - photoY;

  // ── Top band (paper) ──────────────────────────────────────────────────
  ctx.fillStyle = th.band;
  ctx.fillRect(0, 0, W, topBandH);

  // Top accent bar — instant sentiment signal before reading a word: red for
  // news that's bad for the affected instrument's longs, emerald for good,
  // amber for neutral/policy.
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, r(5));

  let Y = r(34);

  // Eyebrow row
  if (isCover) {
    const label = "MARKET PULSE · LAST 24H";
    ctx.font = `900 ${r(12)}px "Inter", sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + r(20), bh = r(26);
    ctx.fillStyle = "#10b981";
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
    const eyebrow = `${(data.source || "WIRE").toUpperCase()}  ·  ${(data.date || "").toUpperCase()}`;
    ctx.fillText(eyebrow, CX, Y + r(6));
    bounds.push({ id: "source", label: "Source & Date", x: CX, y: Y - r(8), w: CW, h: r(20) });
    Y += r(24);
  }

  // Headline with highlighted phrase — budgeted to leave room below for the
  // explanation paragraph (non-cover) or overview + bullets (cover), so a
  // long headline can't auto-fit itself into the rest of the band's space.
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

  // Masthead date — cover only, sits directly beneath the fixed "News That
  // Can Impact Your Trades" title so the cover reads like a magazine issue
  // dated today, not a generic social graphic.
  if (isCover && data.date) {
    ctx.font = `700 ${r(12)}px "Inter", sans-serif`;
    ctx.fillStyle = th.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(data.date).toUpperCase(), W / 2, Y + r(7));
    Y += r(22);
  }

  if (!isCover) {
    // Trader-relevant explanation, with key numbers/entities highlighted —
    // renders directly below the headline, exactly like a news app.
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
      bounds.push({ id: "description", label: "Explanation", x: CX, y: Y, w: CW, h: descLines.length * descLineH });
      Y += descLines.length * descLineH + r(6);
    }
  }

  if (isCover) {
    // Overview paragraph, with key numbers/entities highlighted
    const ovNormalFont = `600 ${r(15.5)}px "Inter", sans-serif`;
    const ovBoldFont = `800 ${r(15.5)}px "Inter", sans-serif`;
    const ovLineH = r(20);
    const ovTokens = tokenizeParagraphHighlights(data.description || "", Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []);
    const overviewLines = wrapParagraphTokens(ctx, ovTokens, CW * 0.92, ovNormalFont, ovBoldFont).slice(0, 3);
    drawParagraphLines(ctx, overviewLines, ovNormalFont, ovBoldFont, ovLineH, CX, Y, th.textSoft, pal.bg, "center", W / 2);
    bounds.push({ id: "description", label: "Overview", x: CX, y: Y, w: CW, h: overviewLines.length * ovLineH });
    Y += overviewLines.length * ovLineH + r(16);

    // Divider
    ctx.strokeStyle = th.divider;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CX, Y); ctx.lineTo(CXR, Y); ctx.stroke();
    Y += r(16);

    // Bullet roundup of the batch's stories
    const bullets: string[] = Array.isArray(data.bulletHeadlines) ? data.bulletHeadlines.slice(0, 5) : [];
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const bulletFont = `700 ${r(13.5)}px "Inter", sans-serif`;
    const bulletMaxY = topBandH - r(14);
    for (const headline of bullets) {
      if (Y + r(22) > bulletMaxY) break;
      ctx.fillStyle = "#10b981";
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

    // Broad, eased fade at the seam — dissolves the paper band into the
    // photo over a wide span (not a thin edge line) so the transition reads
    // as a gradual dissolve from top to bottom, not a hard cut. Fades into the
    // band color so light and dark themes both blend seamlessly.
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

  // Bottom scrim for legible chrome
  const scrim = ctx.createLinearGradient(0, H - photoH * 0.42, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H - photoH * 0.42, W, photoH * 0.42);

  // Chip row — top-left of the photo area: impact level, then which
  // instruments this news moves and in which direction (per-instrument
  // colored chips: emerald ▲ bullish, red ▼ bearish, amber • neutral).
  {
    let chipX = CX;
    const chipY = photoY + r(16);
    const chipH = r(24);
    const rowMaxW = W - CX - r(16);

    if (!isCover && data.impact) {
      const impactDotColor = data.impact === "High" ? "#ef4444" : data.impact === "Medium" ? "#f59e0b" : "#9ca3af";
      const label = `${String(data.impact).toUpperCase()} IMPACT`;
      ctx.font = `800 ${r(10.5)}px "Inter", sans-serif`;
      const tw = ctx.measureText(label).width;
      const chipW = tw + r(26);
      ctx.fillStyle = "rgba(10,10,10,0.55)";
      rrect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = impactDotColor;
      ctx.beginPath(); ctx.arc(chipX + r(13), chipY + chipH / 2, r(3.5), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chipX + r(22), chipY + chipH / 2 + r(0.5));
      chipX += chipW + r(8);
    }

    const instrumentImpacts: { symbol: string; sentiment?: string }[] = Array.isArray(data.instrumentImpacts) ? data.instrumentImpacts : [];
    let chipRowY = chipY;
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    for (const inst of instrumentImpacts.slice(0, 4)) {
      if (!inst?.symbol) continue;
      const arrow = inst.sentiment === "Bullish" ? "▲" : inst.sentiment === "Bearish" ? "▼" : "•";
      const label = `${arrow} ${inst.symbol}`;
      const tw = ctx.measureText(label).width;
      const chipW = tw + r(18);
      if (chipX + chipW > CX + rowMaxW && chipX > CX) {
        chipX = CX;
        chipRowY += chipH + r(6);
      }
      const instPal = sentimentPalette(inst.sentiment, sentimentScheme);
      ctx.fillStyle = instPal.bg;
      rrect(ctx, chipX, chipRowY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = instPal.fg;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chipX + r(9), chipRowY + chipH / 2 + r(0.5));
      chipX += chipW + r(8);
    }
  }

  ctx.restore();
  bounds.push({ id: "imageUrl", label: "News Image", x: 0, y: photoY, w: W, h: photoH });

  // ── Carousel chrome over the photo ──────────────────────────────────
  const chromeY = H - r(30);

  // Numbered badge (bottom-left) — cover gets a "TODAY" chip instead of a number
  const badgeText = isCover ? "TODAY'S BRIEFING" : `#${Math.max(1, activeNewsIndex)}`;
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

  // Brand handle (bottom-right)
  ctx.font = `900 ${r(13)}px "Inter", sans-serif`;
  const xW = ctx.measureText("X").width;
  ctx.textAlign = "right";
  ctx.fillStyle = "#10b981";
  ctx.fillText("X", CXR, chromeY + r(0.5));
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("STRATI", CXR - xW, chromeY + r(0.5));

  // Dot pagination (bottom-center)
  if (totalNewsCount > 1) {
    const dotSpacing = r(11);
    const totalDotsW = (totalNewsCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    for (let i = 0; i < totalNewsCount; i++) {
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, chromeY, r(2.6), 0, Math.PI * 2);
      ctx.fillStyle = i === activeNewsIndex ? "#FFFFFF" : "rgba(255,255,255,0.32)";
      ctx.fill();
    }
  }

  // NOTE: prev/next carousel arrows are real app UI (overlaid on the preview,
  // outside this canvas) — not drawn into the poster image. See the
  // "Preview carousel nav" buttons in the Interactive Preview panel below.

  return bounds;
}
