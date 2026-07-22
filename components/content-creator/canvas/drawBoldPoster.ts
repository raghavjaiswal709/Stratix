import type { PosterElement } from "../types";
import type { GradientPreset } from "../constants";
import type { Rfn, SentimentScheme, HLToken } from "./canvasUtils";
import {
  rrect,
  paintGrain,
  drawIconBadge,
  drawWordmark,
  formatPosterTimestamp,
  drawSegmentedPagination,
  setTracking,
  hexToRgba,
  sentimentPalette,
  tokenizeHighlight,
  fitHighlightTitle,
  tokenizeParagraphHighlights,
  wrapParagraphTokens,
  drawParagraphLines,
  computeCoverFitSlack,
  getAntonFontFamily,
  HEADLINE_MIN_PX,
  HEADLINE_MAX_PX,
} from "./canvasUtils";


// "Bold & Trending" style — an alternate look for News/Facts/Learnings,
// selectable from the Colors tab (default stays the editorial paper-band
// renderers above). Full-bleed moody gradient, huge condensed uppercase
// headline, white pill badges — one shared renderer for all three
// categories (same pattern as drawEducationalCard for facts/learnings),
// differing only in eyebrow copy.
export function drawBoldPoster(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  kind: "news" | "facts" | "learnings",
  gradient: GradientPreset,
  fadeIntensity: number = 100,
  sentimentScheme: SentimentScheme = "emerald"
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const fadeMult = Math.max(0, Math.min(200, fadeIntensity)) / 100;
  const isCover = !!data.isCover;
  const [stopA, stopB] = gradient.stops;

  // Theme-aware foreground colors — flipped to dark for light-toned presets
  // (Pure White) so text/pills/dots stay legible against any gradient.
  const isLight = !!gradient.isLight;
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const fgSoft = isLight ? "rgba(10,10,10,0.78)" : "rgba(255,255,255,0.82)";
  const fgMuted = isLight ? "rgba(10,10,10,0.68)" : "rgba(255,255,255,0.7)";
  const fgFaint = isLight ? "rgba(10,10,10,0.32)" : "rgba(255,255,255,0.3)";
  const pillBg = isLight ? "#111111" : "#ffffff";
  const pillFg = gradient.pillAccent ?? gradient.accent;
  const dotActive = isLight ? "#0a0a0a" : "#ffffff";
  const dotInactive = isLight ? "rgba(10,10,10,0.32)" : "rgba(255,255,255,0.32)";
  const scrimBase = isLight ? "255,255,255" : "0,0,0";

  const PAD = r(30);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;

  // ── Measurement pre-pass ────────────────────────────────────────────────
  // Everything below the photo (eyebrow, headline, description, chips,
  // chrome) is measured BEFORE the photo is drawn, so the photo's share of
  // the frame (`contentZoneH`) can shrink to guarantee the description
  // always renders in FULL — never truncated with an ellipsis — instead of
  // a fixed 56/44 split that clips longer descriptions.
  const idealContentZoneH = Math.round(H * 0.56);
  const floorContentZoneH = Math.round(H * 0.3);

  const eyebrowLabel = kind === "news"
    ? (isCover ? "TODAY'S BRIEFING" : "TRENDING")
    : kind === "facts"
    ? (isCover ? "TODAY'S FACTS" : "FACT")
    : (isCover ? "TODAY'S LESSON" : (data.stepLabel ? String(data.stepLabel).toUpperCase() : "LESSON"));
  const eyebrowBH = r(30);
  const eyebrowGapAfter = r(18);

  // The highlighted phrase carries the pop of color. For news story cards it
  // takes the sentiment color — positive tint (emerald or sky blue, per the
  // user-selectable scheme) when bullish, red when bearish — so the deck
  // reads at a glance like the editorial style; covers and Facts/Learnings
  // (no sentiment) use the gradient accent.
  const sentiment = data.sentiment;
  const newsHighlightColor = sentiment === "Bullish" ? (sentimentScheme === "skyblue" ? "#0ea5e9" : "#34d399") : sentiment === "Bearish" ? "#fb7185" : gradient.accent;
  const highlightColor = (kind === "news" && !isCover) ? newsHighlightColor : gradient.accent;
  // On the two strict monochrome themes, the accent highlight is the SAME
  // brightness extreme as the base text color (pure white on Jet Black, pure
  // black on Pure White) — hue can't separate them, so give the base text a
  // real brightness cut (not a token one) to keep the highlight unmistakable.
  // Every colored gradient keeps full-strength base text — hue alone already
  // separates the highlight there, no dimming needed.
  const headlineBase = !gradient.monochrome
    ? fg
    : isLight ? "rgba(10,10,10,0.55)" : "rgba(255,255,255,0.58)";

  const rawTitle = (data.title || "Untitled").trim().toUpperCase();
  const highlight = (data.highlightPhrase || "").trim().toUpperCase();
  const tokens = tokenizeHighlight(rawTitle, highlight);
  const instrumentImpacts: { symbol: string; sentiment?: string }[] =
    (kind === "news" && !isCover && Array.isArray(data.instrumentImpacts)) ? data.instrumentImpacts : [];
  const chipReserve = instrumentImpacts.length > 0 ? r(34) : 0;
  const bottomReserve = r(70) + chipReserve; // swipe hint + pagination + chip row
  const descLineH = r(20);
  const descBudget = data.description ? descLineH * 3 + r(10) : 0;

  const YafterEyebrow_ideal = idealContentZoneH + r(28) + eyebrowBH + eyebrowGapAfter;
  const headlineMaxH = Math.max(H - YafterEyebrow_ideal - bottomReserve - descBudget, r(40));
  const antonFamily = getAntonFontFamily();
  setTracking(ctx, -r(0.4));
  const fit = fitHighlightTitle(ctx, tokens, CW, headlineMaxH, r(HEADLINE_MIN_PX), r(HEADLINE_MAX_PX), antonFamily, "400", 1.04);
  setTracking(ctx, 0);
  let YafterHeadline_ideal = YafterEyebrow_ideal + fit.lines.length * fit.lineH + r(10);
  if (isCover && kind === "news" && data.date) YafterHeadline_ideal += r(22);

  // Description — full text, auto-fit rather than truncated. First choice
  // is to reclaim room from the photo (text stays full-size, the image just
  // gives up some of its share of the frame, down to a floor); only if the
  // photo is already at that floor and it's still not enough does the type
  // itself shrink, as an absolute last resort — it never drops words.
  const descText = (data.description || "").trim();
  const barW = r(3), barGap = r(14);
  const descX = CX + barW + barGap;
  const descW = CW - barW - barGap;
  const descTokens = descText ? tokenizeParagraphHighlights(descText, Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []) : [];

  let contentZoneH = idealContentZoneH;
  let descLines: HLToken[][] = [];
  let descNormalFont = `600 ${r(15.5)}px "Inter", sans-serif`;
  let descBoldFont = `800 ${r(15.5)}px "Inter", sans-serif`;
  let descLineHFinal = descLineH;

  if (descText) {
    const wrapAt = (size: number) => {
      const nf = `600 ${r(size)}px "Inter", sans-serif`;
      const bf = `800 ${r(size)}px "Inter", sans-serif`;
      return { lines: wrapParagraphTokens(ctx, descTokens, descW, nf, bf), lineH: r(size * 1.29), nf, bf };
    };
    let attempt = wrapAt(15.5);
    let neededH = attempt.lines.length * attempt.lineH;
    let availH = H - r(30) - bottomReserve - YafterHeadline_ideal;

    if (neededH > availH) {
      const shortfall = neededH - availH;
      contentZoneH = Math.max(floorContentZoneH, idealContentZoneH - shortfall);
      availH += idealContentZoneH - contentZoneH;

      if (neededH > availH) {
        for (let size = 14.5; size >= 11; size -= 0.5) {
          attempt = wrapAt(size);
          neededH = attempt.lines.length * attempt.lineH;
          if (neededH <= availH) break;
        }
      }
    }
    descLines = attempt.lines;
    descNormalFont = attempt.nf;
    descBoldFont = attempt.bf;
    descLineHFinal = attempt.lineH;
  }

  // ── Background ───────────────────────────────────────────────────────
  // Full-bleed diagonal gradient base — everything else layers on top.
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, stopA);
  bgGrad.addColorStop(1, stopB);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Accent glow rising behind the lower content — this is what gives the
  // reference poster its rich "perfect shade" depth instead of a flat wash.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.7, 0, W * 0.5, H * 0.7, W * 0.85);
  glow.addColorStop(0, hexToRgba(gradient.accent, (isLight ? 0.14 : 0.28) * fadeMult));
  glow.addColorStop(0.55, hexToRgba(gradient.accent, (isLight ? 0.05 : 0.1) * fadeMult));
  glow.addColorStop(1, hexToRgba(gradient.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Secondary tight glow behind the masthead — gives the logo a lit "stage"
  // instead of floating flat on a corner of the gradient.
  const glow2 = ctx.createRadialGradient(W * 0.08, H * 0.05, 0, W * 0.08, H * 0.05, W * 0.55);
  glow2.addColorStop(0, hexToRgba(gradient.accent, (isLight ? 0.08 : 0.16) * fadeMult));
  glow2.addColorStop(1, hexToRgba(gradient.accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Vignette — darkens the four edges so the eye is pulled back toward the
  // center content column instead of drifting off the frame.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${isLight ? 0.1 : 0.32})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Film grain — the cheapest way to turn a flat gradient into a textured,
  // printed surface instead of a screenshot-flat wash.
  paintGrain(ctx, W, H, isLight ? 0.035 : 0.05);

  if (img) {
    // Seamless, slow dissolve: draw the photo on an offscreen layer spanning
    // the ENTIRE poster height, fade ITS OWN alpha out gradually across that
    // whole span (never fully to zero — a faint trace survives to the very
    // bottom edge), then composite over the gradient+glow. Because the photo
    // melts into transparency rather than a fixed color, the gradient shows
    // straight through underneath — no hard band anywhere.
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const octx = off.getContext("2d");
    if (octx) {
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
      octx.drawImage(img, -slackX * focusX, -slackY * focusY, dw, dh);

      octx.globalCompositeOperation = "destination-in";
      const mask = octx.createLinearGradient(0, 0, 0, H);
      mask.addColorStop(0,    "rgba(0,0,0,1)");
      mask.addColorStop(0.38, "rgba(0,0,0,1)");
      mask.addColorStop(0.6,  "rgba(0,0,0,0.62)");
      mask.addColorStop(0.8,  "rgba(0,0,0,0.28)");
      mask.addColorStop(1,    "rgba(0,0,0,0.06)");
      octx.fillStyle = mask;
      octx.fillRect(0, 0, W, H);

      ctx.drawImage(off, 0, 0);
    }
    bounds.push({ id: "imageUrl", label: "Background Image", x: 0, y: 0, w: W, h: H });

    // Content-contrast scrim — ramps up toward the bottom, tinted with this
    // gradient's own far stop, so the copy stays legible even though the
    // (now very faint) image remains visible underneath all the way down.
    const contentScrim = ctx.createLinearGradient(0, contentZoneH * 0.7, 0, H);
    contentScrim.addColorStop(0,   `rgba(${scrimBase},0)`);
    contentScrim.addColorStop(0.4, `rgba(${scrimBase},${0.35 * fadeMult})`);
    contentScrim.addColorStop(0.7, `rgba(${scrimBase},${0.62 * fadeMult})`);
    contentScrim.addColorStop(1,   `rgba(${scrimBase},${0.86 * fadeMult})`);
    ctx.fillStyle = contentScrim;
    ctx.fillRect(0, contentZoneH * 0.7, W, H - contentZoneH * 0.7);

    // Faint top scrim so the logo badge reads over bright photos too.
    const topScrim = ctx.createLinearGradient(0, 0, 0, r(90));
    topScrim.addColorStop(0, `rgba(${scrimBase},${0.35 * fadeMult})`);
    topScrim.addColorStop(1, `rgba(${scrimBase},0)`);
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, W, r(90));
  } else {
    bounds.push({ id: "imageUrl", label: "Background Image", x: 0, y: 0, w: W, h: contentZoneH });
    ctx.font = `700 ${r(12)}px "Inter", sans-serif`;
    ctx.fillStyle = fgFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("[ ATTACH IMAGE — see Grok prompt ]", W / 2, contentZoneH * 0.5);
  }

  // Logo — the plain themed wordmark (same treatment as the Outro card),
  // sized up from the old pill badge, "X" tinted with this gradient's own
  // accent so the brand mark matches whichever color is currently selected.
  {
    const logoFontSize = r(23);
    const logoY = r(24) + r(16);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = r(12);
    ctx.shadowOffsetY = r(2);
    drawWordmark(ctx, CX, logoY, logoFontSize, fg, gradient.accent, "left", "middle");
    ctx.restore();

    // Render-time date/time — top-right, mirroring the logo on the opposite
    // side at the exact same vertical position.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = r(8);
    ctx.shadowOffsetY = r(1);
    ctx.font = `700 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.4));
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fgMuted;
    ctx.fillText(formatPosterTimestamp(), CXR, logoY);
    setTracking(ctx, 0);
    ctx.restore();
  }

  // Eyebrow pill — same theme-flipped pill treatment as the logo badge.
  // Centered horizontally on the cover/intro slide only (its own dedicated
  // moment); every other slide keeps it left-aligned with the rest of the copy.
  let Y = contentZoneH + r(28);
  {
    ctx.font = `900 ${r(12.5)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.6));
    const tw = ctx.measureText(eyebrowLabel).width;
    const dotGap = r(16);
    const bw = tw + r(20) + dotGap, bh = eyebrowBH;
    const pillX = isCover ? (W - bw) / 2 : CX;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = r(10);
    ctx.shadowOffsetY = r(3);
    ctx.fillStyle = pillBg;
    rrect(ctx, pillX, Y, bw, bh, bh / 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(pillX + r(14), Y + bh / 2, r(3), 0, Math.PI * 2);
    ctx.fillStyle = pillFg;
    ctx.fill();
    ctx.fillStyle = pillFg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(eyebrowLabel, pillX + r(10) + dotGap, Y + bh / 2 + r(0.5));
    setTracking(ctx, 0);
    bounds.push({ id: "category", label: "Eyebrow", x: pillX, y: Y, w: bw, h: bh });
    Y += bh + eyebrowGapAfter;
  }

  // Headline — huge, condensed, ALL CAPS, center-aligned, set in Anton (the
  // dedicated poster/display face, not Inter) with a dark stroke behind the
  // fill on colored gradients — matches the reference poster's exact type
  // treatment instead of approximating it with a heavy system weight.
  // `fit` was already computed in the measurement pre-pass above — reused
  // as-is so the headline's size never depends on where the photo ended up.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // Skip the stroke on the two monochrome themes — the highlight there is
  // already carried by a brightness cut (see headlineBase above), and a
  // same-tone stroke behind a translucent fill just muddies the edge.
  const useStroke = !gradient.monochrome;
  setTracking(ctx, -r(0.4));
  fit.lines.forEach((line, li) => {
    ctx.font = fit.font;
    const widths = line.map((tok) => ctx.measureText(tok.text).width);
    const spaceW = ctx.measureText(" ").width;
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, line.length - 1);
    let x = W / 2 - totalW / 2;
    const baseline = Y + li * fit.lineH + fit.fontSize * 0.86;
    line.forEach((tok, ti) => {
      ctx.font = fit.font;
      if (useStroke) {
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.lineWidth = fit.fontSize * 0.1;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.strokeText(tok.text, x, baseline);
      }
      ctx.fillStyle = tok.isHL ? highlightColor : headlineBase;
      ctx.fillText(tok.text, x, baseline);
      x += widths[ti] + spaceW;
    });
  });
  setTracking(ctx, 0);
  bounds.push({ id: "title", label: "Headline", x: CX, y: Y, w: CW, h: fit.lines.length * fit.lineH });
  Y += fit.lines.length * fit.lineH + r(10);

  // Masthead date — News cover only, same "magazine issue dated today"
  // treatment as the editorial style's cover.
  if (isCover && kind === "news" && data.date) {
    ctx.font = `700 ${r(12)}px "Inter", sans-serif`;
    ctx.fillStyle = fgSoft;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(data.date).toUpperCase(), W / 2, Y + r(7));
    Y += r(22);
  }

  // Description — always shown IN FULL, never truncated with an ellipsis
  // (see the measurement pre-pass above: `descLines` and its font were
  // already sized to fit completely, reclaiming room from the photo and,
  // as a last resort, shrinking the type itself).
  if (descText && descLines.length > 0) {
    const descBlockH = descLines.length * descLineHFinal;
    ctx.fillStyle = highlightColor;
    rrect(ctx, CX, Y + r(2), barW, descBlockH - r(4), barW / 2);
    ctx.fill();
    drawParagraphLines(ctx, descLines, descNormalFont, descBoldFont, descLineHFinal, descX, Y, fgSoft, highlightColor, "left");
    bounds.push({ id: "description", label: "Explanation", x: CX, y: Y, w: CW, h: descBlockH });
    Y += descBlockH + r(12);
  }

  // Bottom chrome — swipe hint (hidden on the last card) + segmented
  // pagination rail, stacked as two rows so the rail can run the card's
  // full content width instead of competing with the swipe text for space.
  const chromeY = H - r(30);
  const swipeY = chromeY - r(5);
  const railY = chromeY + r(11);

  // Instrument-impact chips (news story cards) — green ▲ bullish, red ▼
  // bearish, amber ● neutral, each fused to a solid icon badge. This is
  // where the green/red reads on the Bold card; placed below the copy,
  // clear of the swipe row.
  if (instrumentImpacts.length > 0) {
    const chipH = r(30);
    const chipY = Math.min(Y, chromeY - r(20) - chipH);
    let chipX = CX;
    const labelFont = `800 ${r(12)}px "Inter", sans-serif`;
    ctx.font = labelFont;
    for (const inst of instrumentImpacts.slice(0, 4)) {
      if (!inst?.symbol) continue;
      const arrow = inst.sentiment === "Bullish" ? "▲" : inst.sentiment === "Bearish" ? "▼" : "●";
      const label = inst.symbol.toUpperCase();
      const tw = ctx.measureText(label).width;
      const badgeD = chipH - r(6);
      const chipW = badgeD + r(10) + tw + r(16);
      if (chipX + chipW > CXR && chipX > CX) break;
      const pal = sentimentPalette(inst.sentiment, sentimentScheme);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = r(10);
      ctx.shadowOffsetY = r(3);
      ctx.fillStyle = pal.bg;
      rrect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.restore();
      drawIconBadge(ctx, chipX + r(3) + badgeD / 2, chipY + chipH / 2, badgeD, "rgba(0,0,0,0.18)", pal.fg, arrow, r(11));
      ctx.font = labelFont;
      ctx.fillStyle = pal.fg;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chipX + badgeD + r(13), chipY + chipH / 2 + r(0.5));
      chipX += chipW + r(10);
    }
  }
  if (activeIndex < totalCount - 1) {
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(1));
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fgMuted;
    ctx.fillText("SWIPE", CX, swipeY);
    const swipeW = ctx.measureText("SWIPE").width;
    setTracking(ctx, 0);
    const chevX = CX + swipeW + r(10);
    ctx.strokeStyle = fgMuted;
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

  // Top hairline — a thin gradient bar across the very top edge, the kind of
  // masthead touch that separates a poster from a plain screenshot.
  const hairline = ctx.createLinearGradient(0, 0, W, 0);
  hairline.addColorStop(0, hexToRgba(gradient.accent, 0));
  hairline.addColorStop(0.5, hexToRgba(gradient.accent, isLight ? 0.55 : 0.85));
  hairline.addColorStop(1, hexToRgba(gradient.accent, 0));
  ctx.fillStyle = hairline;
  ctx.fillRect(0, 0, W, r(2.5));

  return bounds;
}
