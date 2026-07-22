import type { PosterColors, PosterConfig, PosterElement, AnalysisData } from "../types";
import type { FontFns, Rfn } from "./canvasUtils";
import { rrect, fitText } from "./canvasUtils";


export function drawDailyAnalysisStandard(
  ctx: CanvasRenderingContext2D,
  data: AnalysisData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  let Y = PAD + GUT;

  // Colorful Header Banner block (solid accent background spanning full content width) - Taller!
  const catY = Y;
  const bannerH = r(38);
  rrect(ctx, CX, Y, CW, bannerH, r(4));
  ctx.fillStyle = colors.accent; ctx.fill();

  ctx.font = font.label(12, true); ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(` ◆  ${(data.category || "DAILY ANALYSIS").toUpperCase()}`, CX + r(14), Y + bannerH / 2);
  
  // Date inside the banner (Bigger!)
  if (data.date) {
    ctx.textAlign = "right"; ctx.fillStyle = "#FFFFFF";
    ctx.fillText(data.date, CXR - r(14), Y + bannerH / 2);
  }
  bounds.push({ id: "category", label: "Category & Date", x: CX, y: catY, w: CW, h: bannerH });
  Y += bannerH + r(24);

  // Instrument Name
  const instY = Y;
  ctx.font = font.serif(42, true); ctx.fillStyle = colors.text; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const instName = data.instrument || "XAUUSD";
  ctx.fillText(instName, CX, Y);
  const instW = ctx.measureText(instName).width;

  // Row of solid pills: Timeframe & Session next to Instrument
  let pillX = CX + instW + r(18);
  const pillY = Y + r(10);
  
  if (data.timeframe) {
    const tf = data.timeframe.toUpperCase();
    ctx.font = font.label(10.5, true);
    const tfW = ctx.measureText(tf).width + r(18);
    const tfH = r(24);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tf, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(10);
  }

  if (data.session) {
    const sess = data.session.toUpperCase();
    ctx.font = font.label(10.5, true);
    const sessW = ctx.measureText(sess).width + r(18);
    const tfH = r(24);
    
    rrect(ctx, pillX, pillY, sessW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sess, pillX + sessW / 2, pillY + tfH / 2);
  }
  
  bounds.push({ id: "instrument", label: "Instrument & Pills", x: CX, y: instY, w: CW, h: r(50) });
  Y += r(54);

  // Level Name
  if (data.levelName) {
    const lvlY = Y;
    ctx.font = font.serif(19, true); ctx.fillStyle = colors.muted; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(data.levelName, CX, Y);
    bounds.push({ id: "levelName", label: "Level Name", x: CX, y: lvlY, w: CW, h: r(24) });
    Y += r(30);
  }

  // 1. Image Frame (Chart screenshot) - Constant height in all ratios
  let imgH = 0;
  if (img) {
    imgH = r(245);
    const imgY = Y;
    rrect(ctx, CX, Y, CW, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5; ctx.stroke();
    
    ctx.save();
    rrect(ctx, CX + r(1), Y + r(1), CW - r(2), imgH - r(2), r(4));
    ctx.clip();
    
    // Cover crop algorithm to perfectly fill the canvas space
    const iAR = img.naturalWidth / img.naturalHeight;
    const fAR = CW / imgH;
    let drawW = CW, drawH = imgH, drawX = CX, drawY = Y;
    if (iAR > fAR) {
      drawW = imgH * iAR;
      drawX = CX + (CW - drawW) / 2;
    } else {
      drawH = CW / iAR;
      drawY = Y + (imgH - drawH) / 2;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
    
    bounds.push({ id: "imageUrl", label: "Chart Screenshot", x: CX, y: imgY, w: CW, h: imgH });
    Y += imgH + r(20);
  }

  // 2. Sections (Explanation, Action Plan, Key Levels) - dynamic heights scaling to fill remaining empty space!
  const FY = H - PAD - GUT;
  const footerSpace = r(28) + r(14);
  const totalContentH = FY - Y - footerSpace;

  if (totalContentH > 0) {
    const sections: { id: string; label: string; text: string; share: number; cardH: number }[] = [];
    if (data.description) sections.push({ id: "description", label: "◆ EXPLANATION", text: data.description, share: 0.50, cardH: 0 });
    if (data.whatToDo)     sections.push({ id: "whatToDo",     label: "◆ ACTION PLAN (WHAT TO DO)", text: data.whatToDo,     share: 0.30, cardH: 0 });
    if (data.keyLevels)    sections.push({ id: "keyLevels",    label: "◆ KEY LEVELS",    text: data.keyLevels,    share: 0.20, cardH: 0 });
    
    if (sections.length > 0) {
      const totalShare = sections.reduce((acc, s) => acc + s.share, 0);
      const gapSize = r(12);
      const totalGaps = (sections.length - 1) * gapSize;
      const availForCards = totalContentH - totalGaps;
      
      sections.forEach(s => {
        s.cardH = Math.floor(availForCards * (s.share / totalShare));
      });

      sections.forEach((s) => {
        const cardH = s.cardH;
        rrect(ctx, CX, Y, CW, cardH, r(5));
        ctx.fillStyle = colors.card; ctx.fill();
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
        
        ctx.fillStyle = colors.accent;
        ctx.fillRect(CX, Y + r(6), r(5), cardH - r(12));
        
        ctx.font = font.label(8.5, true); ctx.textBaseline = "top";
        ctx.fillStyle = colors.accent; ctx.textAlign = "left";
        ctx.fillText(s.label, CX + r(16), Y + r(10));
        
        const titleSpace = r(24);
        const fit = fitText(ctx, s.text, CW - r(32), cardH - titleSpace - r(16), r(10.5), r(16));
        
        ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
        fit.lines.forEach((l, i) => {
          const lineY = Y + titleSpace + r(8) + i * fit.lineSpacing;
          if (lineY + fit.lineSpacing < Y + cardH) {
            ctx.fillText(l, CX + r(16), lineY);
          }
        });
        
        bounds.push({ id: s.id, label: s.label, x: CX, y: Y, w: CW, h: cardH });
        Y += cardH + gapSize;
      });
    }
  }

  // Footer
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(14)); ctx.lineTo(CXR, FY - r(14)); ctx.stroke();
  
  ctx.font = font.label(9.5, true); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(5));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent;
  ctx.fillText("stratix.app", CXR, FY - r(5));
  bounds.push({ id: "footer", label: "Footer", x: CX, y: FY - r(14), w: CW, h: r(28) });

  return bounds;
}

export function drawDailyAnalysisSplit(
  ctx: CanvasRenderingContext2D,
  data: AnalysisData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const COL_GAP = r(28);
  const LC = Math.round(CW * 0.45); // left col width (text details)
  const RC = CW - LC - COL_GAP;     // right col width (full-height chart image)
  const RCX = CX + LC + COL_GAP;    // right col X

  let LY = PAD + GUT;

  // Category Banner block for Split - Taller!
  const catY = LY;
  const bannerH = r(34);
  rrect(ctx, CX, LY, LC, bannerH, r(4));
  ctx.fillStyle = colors.accent; ctx.fill();
  
  ctx.font = font.label(11, true); ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(` ◆  ${(data.category || "DAILY ANALYSIS").toUpperCase()}`, CX + r(10), LY + bannerH / 2);
  
  if (data.date) {
    ctx.textAlign = "right"; ctx.fillStyle = "#FFFFFF";
    ctx.fillText(data.date, CX + LC - r(10), LY + bannerH / 2);
  }
  bounds.push({ id: "category", label: "Category & Date", x: CX, y: catY, w: LC, h: bannerH });
  LY += bannerH + r(20);

  // Line Separator
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, LY); ctx.lineTo(CX + LC, LY); ctx.stroke();
  LY += r(22);

  // Instrument Name
  const instY = LY;
  ctx.font = font.serif(34, true); ctx.fillStyle = colors.text; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const instName = data.instrument || "XAUUSD";
  ctx.fillText(instName, CX, LY);
  const instW = ctx.measureText(instName).width;

  // Solid Timeframe & Session Row
  let pillX = CX + instW + r(14);
  const pillY = LY + r(8);
  
  if (data.timeframe) {
    const tf = data.timeframe.toUpperCase();
    ctx.font = font.label(9, true);
    const tfW = ctx.measureText(tf).width + r(14);
    const tfH = r(20);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tf, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(8);
  }

  if (data.session) {
    const sess = data.session.toUpperCase();
    ctx.font = font.label(9, true);
    const sessW = ctx.measureText(sess).width + r(14);
    const tfH = r(20);
    
    rrect(ctx, pillX, pillY, sessW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sess, pillX + sessW / 2, pillY + tfH / 2);
  }
  bounds.push({ id: "instrument", label: "Instrument", x: CX, y: instY, w: LC, h: r(40) });
  LY += r(40);

  // Level Name
  if (data.levelName) {
    const lvlY = LY;
    ctx.font = font.serif(17, true); ctx.fillStyle = colors.muted; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(data.levelName, CX, LY);
    bounds.push({ id: "levelName", label: "Level Name", x: CX, y: lvlY, w: LC, h: r(22) });
    LY += r(26);
  }

  // Explanation/Description Card (Left Column) - Dynamic Height Stretch & Word Wrap
  const FY = H - PAD - GUT;
  const footerSpace = r(28) + r(14);
  const cardH = FY - LY - footerSpace; // Stretch to align with footer line

  if (cardH > 0) {
    const sections: { id: string; label: string; text: string; share: number; cardH: number }[] = [];
    if (data.description) sections.push({ id: "description", label: "◆ EXPLANATION", text: data.description, share: 0.50, cardH: 0 });
    if (data.whatToDo)     sections.push({ id: "whatToDo",     label: "◆ ACTION PLAN", text: data.whatToDo,     share: 0.30, cardH: 0 });
    if (data.keyLevels)    sections.push({ id: "keyLevels",    label: "◆ KEY LEVELS",    text: data.keyLevels,    share: 0.20, cardH: 0 });

    if (sections.length > 0) {
      const totalShare = sections.reduce((acc, s) => acc + s.share, 0);
      const gapSize = r(10);
      const totalGaps = (sections.length - 1) * gapSize;
      const availForCards = cardH - totalGaps;

      sections.forEach(s => {
        s.cardH = Math.floor(availForCards * (s.share / totalShare));
      });

      let currentLY = LY;
      sections.forEach((s) => {
        const secCardH = s.cardH;
        rrect(ctx, CX, currentLY, LC, secCardH, r(5));
        ctx.fillStyle = colors.card; ctx.fill();
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
        
        ctx.fillStyle = colors.accent;
        ctx.fillRect(CX, currentLY + r(4), r(4), secCardH - r(8));
        
        ctx.font = font.label(8, true); ctx.textBaseline = "top";
        ctx.fillStyle = colors.accent; ctx.textAlign = "left";
        ctx.fillText(s.label, CX + r(12), currentLY + r(8));
        
        const titleSpace = r(20);
        const fit = fitText(ctx, s.text, LC - r(24), secCardH - titleSpace - r(12), r(9.5), r(14));
        
        ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
        fit.lines.forEach((l, i) => {
          const lineY = currentLY + titleSpace + r(6) + i * fit.lineSpacing;
          if (lineY + fit.lineSpacing < currentLY + secCardH) {
            ctx.fillText(l, CX + r(12), lineY);
          }
        });

        bounds.push({ id: s.id, label: s.label, x: CX, y: currentLY, w: LC, h: secCardH });
        currentLY += secCardH + gapSize;
      });
    }
  }

  // Vertical column separator
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CX + LC + COL_GAP / 2, PAD + GUT);
  ctx.lineTo(CX + LC + COL_GAP / 2, FY);
  ctx.stroke();

  // Right Column: Full-Height Image
  const imgY = PAD + GUT;
  const imgH = FY - imgY - r(40);
  if (img) {
    rrect(ctx, RCX, imgY, RC, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
    
    ctx.save();
    rrect(ctx, RCX + r(1), imgY + r(1), RC - r(2), imgH - r(2), r(4));
    ctx.clip();
    
    // Cover Crop
    const iAR = img.naturalWidth / img.naturalHeight;
    const fAR = RC / imgH;
    let drawW = RC, drawH = imgH, drawX = RCX, drawY = imgY;
    if (iAR > fAR) {
      drawW = imgH * iAR;
      drawX = RCX + (RC - drawW) / 2;
    } else {
      drawH = RC / iAR;
      drawY = imgY + (imgH - drawH) / 2;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    rrect(ctx, RCX, imgY, RC, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = font.label(10, true); ctx.fillStyle = colors.muted;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("CHART SCREENSHOT", RCX + RC / 2, imgY + imgH / 2);
  }
  bounds.push({ id: "imageUrl", label: "Chart Screenshot", x: RCX, y: imgY, w: RC, h: imgH });

  // Footer (Full Width)
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(14)); ctx.lineTo(CXR, FY - r(14)); ctx.stroke();
  
  ctx.font = font.label(9, true); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(5));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent;
  ctx.fillText("stratix.app", CXR, FY - r(5));
  bounds.push({ id: "footer", label: "Footer", x: CX, y: FY - r(14), w: CW, h: r(28) });

  return bounds;
}

export function drawDailyAnalysis(
  ctx: CanvasRenderingContext2D,
  data: AnalysisData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
  land: boolean
): PosterElement[] {
  if (land) {
    return drawDailyAnalysisSplit(ctx, data, img, W, H, S, PAD, CX, CXR, CW, GUT, r, font, colors, config);
  } else {
    return drawDailyAnalysisStandard(ctx, data, img, W, H, S, PAD, CX, CXR, CW, GUT, r, font, colors, config);
  }
}
