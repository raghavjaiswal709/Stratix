import type { PosterElement } from "../types";
import type { GradientPreset } from "../constants";
import type { Rfn, SentimentScheme } from "./canvasUtils";
import {
  rrect,
  wrap,
  paintGrain,
  drawIconBadge,
  drawWordmark,
  formatPosterTimestamp,
  drawSegmentedPagination,
  setTracking,
  fitText,
  hexToRgba,
  contrastTextColor,
  tokenizeHighlight,
  fitHighlightTitle,
  drawHighlightLines,
  computeCoverFitSlack,
} from "./canvasUtils";


// The batch's final slide — a calm, brand-forward sign-off, deliberately the
// opposite mood of the story cards: no impact badge, no ticker chips, no
// eyebrow, just the wordmark, the sign-off line, and one CTA. Shared by
// every category (News/Facts/Learnings) so the batch always closes the same
// way regardless of what generated it — dispatched mode-agnostically from
// drawPoster via `data.isOutro`.
export function drawOutroCard(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  gradient?: GradientPreset
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const accentColor = gradient?.accent ?? "#10b981";
  const isLight = !!gradient?.isLight;
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const fgWordmark = isLight ? "rgba(10,10,10,0.88)" : "rgba(255,255,255,0.92)";
  const fgSubtext = isLight ? "rgba(10,10,10,0.6)" : "rgba(255,255,255,0.62)";
  const dotActive = isLight ? "#0a0a0a" : "#ffffff";
  const dotInactive = isLight ? "rgba(10,10,10,0.32)" : "rgba(255,255,255,0.32)";
  const scrimRgb = isLight ? "250,250,250" : "6,8,7";

  // Background: full-bleed cover-fit image, darkened, if one's attached —
  // otherwise a calm wash (the Bold style's gradient preset when active,
  // else the default charcoal-to-emerald look). Either way this reads as
  // "settled", not "breaking news".
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  if (img) {
    const iAR = img.naturalWidth / img.naturalHeight;
    const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
    const { slackX, slackY } = computeCoverFitSlack(iAR, W, H, zoom);
    const fAR = W / H;
    let baseW = W, baseH = H;
    if (iAR > fAR) { baseH = H; baseW = H * iAR; }
    else { baseW = W; baseH = W / iAR; }
    const dw = baseW * zoom, dh = baseH * zoom;
    const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
    ctx.drawImage(img, -slackX * focusX, -slackY * focusY, dw, dh);
    bounds.push({ id: "imageUrl", label: "Background Image", x: 0, y: 0, w: W, h: H });
  } else if (gradient) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, gradient.stops[0]);
    bg.addColorStop(1, gradient.stops[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.9);
    bg.addColorStop(0, "#132520");
    bg.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Scrim over the whole frame (heavier than the story-card photo scrim) so
  // the sign-off text sits calmly on top regardless of what's underneath.
  // Tinted light instead of dark on the Pure White theme so it stays a wash,
  // not a muddy overlay, under the now-dark text.
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, `rgba(${scrimRgb},0.72)`);
  scrim.addColorStop(0.45, `rgba(${scrimRgb},0.55)`);
  scrim.addColorStop(1, `rgba(${scrimRgb},0.86)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  const CX = r(40), CXR = W - r(40), CW = CXR - CX;
  ctx.textAlign = "center";

  // Wordmark — the shared themed wordmark, sized up as the centerpiece here.
  const markY = H * 0.3;
  drawWordmark(ctx, W / 2, markY, r(22), fgWordmark, accentColor, "center", "alphabetic");
  ctx.textAlign = "center";

  // Headline
  const headline = (data.title || "We're Always Watching The Markets").trim();
  const headlineFit = fitText(ctx, headline, CW, H * 0.16, r(24), r(38));
  let Y = markY + r(46);
  ctx.font = `800 ${headlineFit.fontSize}px "Inter", sans-serif`;
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  headlineFit.lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, Y + i * headlineFit.lineSpacing + headlineFit.lineSpacing / 2);
  });
  bounds.push({ id: "title", label: "Headline", x: CX, y: Y, w: CW, h: headlineFit.lines.length * headlineFit.lineSpacing });
  Y += headlineFit.lines.length * headlineFit.lineSpacing + r(14);

  // Subtext
  const subtext = (data.description || "").trim();
  if (subtext) {
    ctx.font = `500 ${r(14)}px "Inter", sans-serif`;
    const subLines = wrap(ctx, subtext, CW * 0.82).slice(0, 4);
    const subLineH = r(20);
    ctx.fillStyle = fgSubtext;
    subLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, Y + i * subLineH + subLineH / 2);
    });
    bounds.push({ id: "description", label: "Subtext", x: CX, y: Y, w: CW, h: subLines.length * subLineH });
    Y += subLines.length * subLineH + r(24);
  }

  // CTA pill
  const cta = (data.cta || "Follow for daily market briefings").trim();
  ctx.font = `700 ${r(12.5)}px "Inter", sans-serif`;
  const ctaW = ctx.measureText(cta).width + r(44);
  const ctaH = r(38);
  const ctaX = W / 2 - ctaW / 2;
  ctx.strokeStyle = hexToRgba(accentColor, 0.55);
  ctx.lineWidth = 1.5;
  ctx.fillStyle = hexToRgba(accentColor, 0.12);
  rrect(ctx, ctaX, Y, ctaW, ctaH, ctaH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.fillText(cta, W / 2, Y + ctaH / 2 + r(0.5));
  bounds.push({ id: "cta", label: "Call To Action", x: ctaX, y: Y, w: ctaW, h: ctaH });

  // Dot pagination — kept for carousel-position continuity with every other
  // card in the batch, even though the badge/ticker chrome is dropped.
  if (totalCount > 1) {
    const chromeY = H - r(30);
    const dotSpacing = r(11);
    const totalDotsW = (totalCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    for (let i = 0; i < totalCount; i++) {
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, chromeY, r(2.6), 0, Math.PI * 2);
      ctx.fillStyle = i === activeIndex ? dotActive : dotInactive;
      ctx.fill();
    }
  }

  return bounds;
}
// A News story's plain-language companion card — a bento grid of "What
// Happened", "Why It Matters", and per-market impact chips, all written for
// a reader who has never heard of this story before today. Deliberately a
// different visual language from the trader-facing story card it follows:
// light, warm, rounded cells rather than a dark editorial/bold treatment —
// this is the one card in the batch meant to feel approachable, not urgent.
// Takes no image (bento cards never carry a photo) — `gradient` is optional
// purely for accent-color continuity with the batch's Bold gradient choice,
// same "only when Bold is active" convention as drawOutroCard.
export function drawBentoExplainerCard(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  gradient?: GradientPreset,
  sentimentScheme: SentimentScheme = "emerald",
  isReel: boolean = false
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const accent = gradient?.accent ?? "#10b981";
  const isLight = gradient ? !!gradient.isLight : true;
  const bg = isLight ? "#fbfaf7" : "#111412";
  const cardBg = isLight ? "#ffffff" : "rgba(255,255,255,0.05)";
  const cardBorder = isLight ? "rgba(10,10,10,0.08)" : "rgba(255,255,255,0.08)";
  const textPrimary = isLight ? "#161613" : "rgba(255,255,255,0.92)";
  const textMuted = isLight ? "rgba(22,22,19,0.55)" : "rgba(255,255,255,0.55)";
  const dotActive = isLight ? "#161613" : "#ffffff";
  const dotInactive = isLight ? "rgba(22,22,19,0.28)" : "rgba(255,255,255,0.28)";
  // Section labels are painted in `accent` directly on the (near-)white card
  // background in light mode — if accent is itself very light (some
  // monochrome presets), that text would vanish too, so fall back to the
  // primary text color whenever accent can't carry its own contrast here.
  const accentReadableOnCard = !(isLight && contrastTextColor(accent) === "#0a0a0a");
  const labelColor = accentReadableOnCard ? accent : textPrimary;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The parent story's own photo, bled in at very low visibility — a faint
  // echo that ties this explainer card back to the story it's unpacking,
  // without competing with the (approachable, text-first) content on top.
  if (img) {
    const iAR = img.naturalWidth / img.naturalHeight;
    const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
    const { slackX, slackY } = computeCoverFitSlack(iAR, W, H, zoom);
    const fAR = W / H;
    let baseW = W, baseH = H;
    if (iAR > fAR) { baseH = H; baseW = H * iAR; }
    else { baseW = W; baseH = W / iAR; }
    const dw = baseW * zoom, dh = baseH * zoom;
    const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
    ctx.save();
    ctx.globalAlpha = isLight ? 0.07 : 0.12;
    ctx.drawImage(img, -slackX * focusX, -slackY * focusY, dw, dh);
    ctx.restore();
  }

  const glow = ctx.createRadialGradient(W * 0.18, H * 0.06, 0, W * 0.18, H * 0.06, W * 0.75);
  glow.addColorStop(0, hexToRgba(accent, isLight ? 0.1 : 0.18));
  glow.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Second, tighter glow low-right — balances the frame so it doesn't read
  // as lit from a single corner only.
  const glow2 = ctx.createRadialGradient(W * 0.86, H * 0.92, 0, W * 0.86, H * 0.92, W * 0.6);
  glow2.addColorStop(0, hexToRgba(accent, isLight ? 0.06 : 0.12));
  glow2.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Film grain — same treatment as the Bold card, so a viewer swiping
  // between card kinds feels one continuous printed system, not two apps.
  paintGrain(ctx, W, H, isLight ? 0.03 : 0.045);

  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, hexToRgba(accent, 0.5));
  topBar.addColorStop(0.5, accent);
  topBar.addColorStop(1, hexToRgba(accent, 0.5));
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, r(6));

  const PAD = r(28);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;
  let Y = r(24);

  // Logo — the plain themed wordmark (same treatment as the Outro/Bold
  // cards), sized up from the old pill badge, "X" tinted with this
  // gradient's own accent. `badgeH` stays as the row-height reference the
  // eyebrow pill below centers itself against.
  {
    const badgeH = r(30);
    const logoFontSize = r(21);
    ctx.save();
    ctx.shadowColor = isLight ? "rgba(20,20,15,0.22)" : "rgba(0,0,0,0.4)";
    ctx.shadowBlur = r(10);
    ctx.shadowOffsetY = r(2);
    drawWordmark(ctx, CX, Y + badgeH / 2, logoFontSize, textPrimary, accent, "left", "middle");
    ctx.restore();

    // Eyebrow pill — right-aligned on the same row as the logo normally;
    // centered on the row for reels (with the timestamp moved to the far
    // right instead of hugging the pill, so the row stays a clean
    // logo-left / pill-center / timestamp-right layout). Text color is
    // computed against the actual pill fill (not hardcoded white) — on
    // light/monochrome gradient presets `accent` can itself be near-white,
    // and white-on-white silently renders as an empty pill.
    const eyebrowText = "EXPLAINED SIMPLY";
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.5));
    const dotGap = r(14);
    const eyebrowW = ctx.measureText(eyebrowText).width + r(20) + dotGap;
    const eyebrowH = r(28);
    const eyebrowX = isReel ? (W - eyebrowW) / 2 : CXR - eyebrowW;
    const eyebrowY = Y + (badgeH - eyebrowH) / 2;
    const eyebrowFg = contrastTextColor(accent);
    ctx.save();
    ctx.shadowColor = isLight ? "rgba(20,20,15,0.14)" : "rgba(0,0,0,0.3)";
    ctx.shadowBlur = r(10);
    ctx.shadowOffsetY = r(3);
    ctx.fillStyle = accent;
    rrect(ctx, eyebrowX, eyebrowY, eyebrowW, eyebrowH, eyebrowH / 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(eyebrowX + r(13), eyebrowY + eyebrowH / 2, r(2.8), 0, Math.PI * 2);
    ctx.fillStyle = eyebrowFg;
    ctx.fill();
    // `drawWordmark` above set textAlign/textBaseline INSIDE its own
    // save/restore, so both reverted to canvas defaults ("start"/
    // "alphabetic") when it restored — set them explicitly here rather
    // than relying on leftover state, or this text silently drifts off
    // true vertical center within the pill.
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = eyebrowFg;
    ctx.fillText(eyebrowText, eyebrowX + r(11) + dotGap, eyebrowY + eyebrowH / 2 + r(0.5));
    setTracking(ctx, 0);

    // Render-time date/time — sits just left of the eyebrow pill normally;
    // for reels (where the pill is centered) it moves to the far right
    // instead, keeping the row a clean logo-left / pill-center /
    // timestamp-right layout rather than hanging off the pill's left edge.
    ctx.font = `700 ${r(10.5)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.4));
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textMuted;
    ctx.fillText(formatPosterTimestamp(), isReel ? CXR : eyebrowX - r(12), Y + badgeH / 2);
    setTracking(ctx, 0);

    Y += badgeH + r(22);
  }

  // Everything below is measured BEFORE anything is drawn: each section's
  // box is sized to the actual wrapped text it holds (not a guessed
  // fraction of canvas height), and whatever vertical space is left over —
  // common on tall aspect ratios like Story — becomes extra breathing room
  // between sections instead of a dead gap after the last one or a
  // half-empty box in the middle.
  const impacts: { market: string; effect: string; direction: string }[] = Array.isArray(data.simpleImpacts) ? data.simpleImpacts.slice(0, 4) : [];
  const chipGap = r(12);
  const chipH = r(68);
  const chipRows = impacts.length > 0 ? Math.ceil(impacts.length / 2) : 0;
  const impactsSectionH = impacts.length > 0 ? r(30) + chipRows * chipH + Math.max(0, chipRows - 1) * chipGap : 0;
  // Matches the Bold card's own bottom-chrome reserve now that the footer
  // sits at that same fixed chromeY-based position (swipe row + rail row),
  // so content never crowds into it.
  const footerReserve = r(70);

  // Headline — measure the fitted block first, box hugs it with fixed padding.
  const headline = String(data.simpleHeadline || data.title || "").trim();
  const tokens = tokenizeHighlight(headline, String(data.simpleHeadlineHighlight || ""));
  const headlinePadX = r(24), headlinePadY = r(28);
  const fit = fitHighlightTitle(ctx, tokens, CW - headlinePadX * 2, H * 0.32, r(24), r(42), '"Inter", "Arial Black", sans-serif', "900", 1.14);
  const headlineBlockH = fit.lines.length * fit.lineH;
  const zoneH = Math.max(headlineBlockH + headlinePadY * 2, r(120));

  // Two-cell row — measure both cells' wrapped content at their real font
  // sizes so the shared row height matches whichever cell needs more room.
  const rowGap = r(14);
  const leftW = Math.round(CW * 0.56);
  const rightX = CX + leftW + rowGap;
  const rightW = CW - leftW - rowGap;

  const whPadX = r(18), whPadTop = r(50), whPadBottom = r(26);
  const whatHappened = String(data.whatHappened || data.description || "").trim();
  ctx.font = `600 ${r(17)}px "Inter", sans-serif`;
  const whLineH = r(23);
  const whLines = wrap(ctx, whatHappened, leftW - whPadX * 2).slice(0, 9);
  const leftContentH = whPadTop + whLines.length * whLineH + whPadBottom;

  const wmPadX = r(16), wmPadBottom = r(24);
  ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
  const whyLabelLines = wrap(ctx, "WHY IT MATTERS", rightW - wmPadX * 2);
  const whyItMatters = String(data.whyItMatters || "").trim();
  ctx.font = `600 ${r(15.5)}px "Inter", sans-serif`;
  const wmLineH = r(21);
  const wmLines = wrap(ctx, whyItMatters, rightW - wmPadX * 2).slice(0, 9);
  const wmTextStartOffset = r(28) + whyLabelLines.length * r(15) + r(14);
  const rightContentH = wmTextStartOffset + wmLines.length * wmLineH + wmPadBottom;

  const rowH = Math.max(leftContentH, rightContentH, r(150));

  // Distribute leftover vertical space as extra gap between sections.
  const baseGap = r(20);
  const gapCount = 2 + (impacts.length > 0 ? 1 : 0);
  const minUsedH = Y + zoneH + baseGap + rowH + (impacts.length > 0 ? baseGap + impactsSectionH : 0) + baseGap + footerReserve;
  const leftover = Math.max(0, H - minUsedH);
  const sectionGap = baseGap + Math.min(leftover / gapCount, r(180));

  // ---- Draw headline ----
  ctx.save();
  ctx.shadowColor = isLight ? "rgba(20,20,15,0.14)" : "rgba(0,0,0,0.5)";
  ctx.shadowBlur = r(22);
  ctx.shadowOffsetY = r(8);
  ctx.fillStyle = cardBg;
  rrect(ctx, CX, Y, CW, zoneH, r(22));
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1;
  rrect(ctx, CX, Y, CW, zoneH, r(22));
  ctx.stroke();
  // Glossy inner top edge — a thin highlight along the flat span between
  // the rounded corners, the detail that reads as "glass" rather than flat.
  ctx.strokeStyle = isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX + r(22), Y + 1);
  ctx.lineTo(CX + CW - r(22), Y + 1);
  ctx.stroke();
  const headlineStartY = Y + (zoneH - headlineBlockH) / 2;
  // Same white-on-white guard as the eyebrow pill above.
  drawHighlightLines(ctx, fit.lines, fit.font, fit.fontSize, fit.lineH, W / 2, headlineStartY, r(8), { bg: accent, fg: contrastTextColor(accent) }, textPrimary);
  bounds.push({ id: "simpleHeadline", label: "Simple Headline", x: CX, y: Y, w: CW, h: zoneH });
  Y += zoneH + sectionGap;

  // ---- Draw two-cell row ----
  ctx.save();
  ctx.shadowColor = isLight ? "rgba(20,20,15,0.12)" : "rgba(0,0,0,0.45)";
  ctx.shadowBlur = r(18);
  ctx.shadowOffsetY = r(6);
  ctx.fillStyle = cardBg;
  rrect(ctx, CX, Y, leftW, rowH, r(18));
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1;
  rrect(ctx, CX, Y, leftW, rowH, r(18));
  ctx.stroke();
  ctx.strokeStyle = isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(CX + r(18), Y + 1);
  ctx.lineTo(CX + leftW - r(18), Y + 1);
  ctx.stroke();

  const labelBadgeD = r(18);
  drawIconBadge(ctx, CX + whPadX + labelBadgeD / 2, Y + r(24), labelBadgeD, hexToRgba(accent, isLight ? 0.14 : 0.2), labelColor, "▸", r(9.5));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
  setTracking(ctx, r(0.3));
  ctx.fillStyle = labelColor;
  ctx.fillText("WHAT HAPPENED", CX + whPadX + labelBadgeD + r(8), Y + r(28));
  setTracking(ctx, 0);

  ctx.font = `600 ${r(17)}px "Inter", sans-serif`;
  ctx.fillStyle = textPrimary;
  ctx.textBaseline = "middle";
  whLines.forEach((line, i) => ctx.fillText(line, CX + whPadX, Y + whPadTop + i * whLineH + whLineH / 2));
  bounds.push({ id: "whatHappened", label: "What Happened", x: CX, y: Y, w: leftW, h: rowH });

  ctx.save();
  ctx.shadowColor = isLight ? "rgba(20,20,15,0.1)" : "rgba(0,0,0,0.4)";
  ctx.shadowBlur = r(16);
  ctx.shadowOffsetY = r(5);
  ctx.fillStyle = hexToRgba(accent, isLight ? 0.09 : 0.16);
  rrect(ctx, rightX, Y, rightW, rowH, r(18));
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = hexToRgba(accent, isLight ? 0.35 : 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rightX + r(18), Y + 1);
  ctx.lineTo(rightX + rightW - r(18), Y + 1);
  ctx.stroke();

  const wmBadgeD = r(18);
  drawIconBadge(ctx, rightX + wmPadX + wmBadgeD / 2, Y + r(24), wmBadgeD, hexToRgba(accent, isLight ? 0.22 : 0.3), labelColor, "!", r(10.5));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
  setTracking(ctx, r(0.3));
  ctx.fillStyle = labelColor;
  whyLabelLines.forEach((line, i) => ctx.fillText(line, rightX + wmPadX + wmBadgeD + r(8), Y + r(28) + i * r(15)));
  setTracking(ctx, 0);

  ctx.font = `600 ${r(15.5)}px "Inter", sans-serif`;
  ctx.fillStyle = textPrimary;
  ctx.textBaseline = "middle";
  const wmStartY = Y + wmTextStartOffset;
  wmLines.forEach((line, i) => ctx.fillText(line, rightX + wmPadX, wmStartY + i * wmLineH + wmLineH / 2));
  bounds.push({ id: "whyItMatters", label: "Why It Matters", x: rightX, y: Y, w: rightW, h: rowH });

  Y += rowH;

  // ---- Draw impact chips — plain-language per-market effect, 2 per row.
  // An odd count's last card spans the full width instead of leaving an
  // empty cell beside it. ----
  if (impacts.length > 0) {
    Y += sectionGap;
    // Small accent bar, matching the Bold card's description marker — ties
    // this label to the same visual language as the other section labels'
    // icon badges instead of sitting there as plain, unmarked text.
    ctx.fillStyle = accent;
    rrect(ctx, CX, Y - r(9), r(3), r(11), r(1.5));
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.5));
    ctx.fillStyle = textMuted;
    ctx.fillText("WHO THIS AFFECTS", CX + r(10), Y);
    setTracking(ctx, 0);
    Y += r(18);

    const chipW = Math.floor((CW - chipGap) / 2);
    const impactBadgeD = r(22);
    const oddLast = impacts.length % 2 === 1;
    impacts.forEach((imp, i) => {
      const isFullWidth = oddLast && i === impacts.length - 1;
      const col = i % 2, row = Math.floor(i / 2);
      const cx = isFullWidth ? CX : CX + col * (chipW + chipGap);
      const cy = Y + row * (chipH + chipGap);
      const w = isFullWidth ? CW : chipW;
      const dirColor = imp.direction === "up" ? (sentimentScheme === "skyblue" ? "#0284c7" : "#10b981") : imp.direction === "down" ? "#ef4444" : "#f59e0b";
      const arrow = imp.direction === "up" ? "▲" : imp.direction === "down" ? "▼" : "●";
      ctx.save();
      ctx.shadowColor = isLight ? "rgba(20,20,15,0.1)" : "rgba(0,0,0,0.4)";
      ctx.shadowBlur = r(12);
      ctx.shadowOffsetY = r(4);
      ctx.fillStyle = hexToRgba(dirColor, isLight ? 0.1 : 0.16);
      rrect(ctx, cx, cy, w, chipH, r(16));
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = hexToRgba(dirColor, 0.32);
      ctx.lineWidth = 1;
      rrect(ctx, cx, cy, w, chipH, r(16));
      ctx.stroke();

      drawIconBadge(ctx, cx + r(13) + impactBadgeD / 2, cy + r(19), impactBadgeD, dirColor, "#ffffff", arrow, r(11));

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${r(14)}px "Inter", sans-serif`;
      ctx.fillStyle = dirColor;
      ctx.fillText(imp.market, cx + r(13) + impactBadgeD + r(9), cy + r(19) + r(0.5));

      ctx.font = `600 ${r(12.5)}px "Inter", sans-serif`;
      ctx.fillStyle = textMuted;
      ctx.textBaseline = "alphabetic";
      const effLines = wrap(ctx, imp.effect, w - r(28)).slice(0, 2);
      effLines.forEach((line, li) => ctx.fillText(line, cx + r(14), cy + r(46) + li * r(15)));
    });
    Y += impactsSectionH - r(30);
  }

  // Footer — swipe hint + segmented progress rail, at the EXACT same fixed
  // position as the Bold card's (chromeY/swipeY/railY below are copied
  // constants, not derived from content height) so the carousel's bottom
  // chrome never jumps between card kinds as the viewer swipes through.
  const chromeY = H - r(30);
  const swipeY = chromeY - r(5);
  const railY = chromeY + r(11);
  if (activeIndex < totalCount - 1) {
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(1));
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textMuted;
    ctx.fillText("SWIPE", CX, swipeY);
    const swipeW = ctx.measureText("SWIPE").width;
    setTracking(ctx, 0);
    const chevX = CX + swipeW + r(10);
    ctx.strokeStyle = textMuted;
    ctx.lineWidth = r(1.6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 2; i++) {
      const ox = chevX + i * r(6);
      ctx.beginPath();
      ctx.moveTo(ox, swipeY - r(4));
      ctx.lineTo(ox + r(4), swipeY);
      ctx.lineTo(ox, swipeY + r(4));
      ctx.stroke();
    }
  }
  if (totalCount > 1) {
    drawSegmentedPagination(ctx, CX, railY, CW, r(3), totalCount, activeIndex, dotActive, dotInactive);
  }

  return bounds;
}
