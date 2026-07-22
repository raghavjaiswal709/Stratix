import type { PosterColors, PosterConfig, PosterElement, NewsItem } from "../types";
import type { FontFns, Rfn } from "./canvasUtils";
import { rrect, wrap, fitText } from "./canvasUtils";


export function drawNewsPoster(
  ctx: CanvasRenderingContext2D,
  data: NewsItem,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
  land: boolean
): PosterElement[] {
  const bounds: PosterElement[] = [];
  let Y = PAD + GUT;

  // Colorful Header Banner - Taller!
  const catY = Y;
  const bannerH = r(38);
  rrect(ctx, CX, Y, CW, bannerH, r(4));
  ctx.fillStyle = colors.accent; ctx.fill();

  ctx.font = font.label(12, true); ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(` ◆  MARKET NEWS`, CX + r(14), Y + bannerH / 2);
  
  // News Source inside banner
  if (data.source) {
    ctx.textAlign = "right"; ctx.fillStyle = "#FFFFFF";
    ctx.fillText(data.source.toUpperCase(), CXR - r(14), Y + bannerH / 2);
  }
  bounds.push({ id: "source", label: "News Source", x: CX, y: catY, w: CW, h: bannerH });
  Y += bannerH + r(24);

  // Solid line separator
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, Y); ctx.lineTo(CXR, Y); ctx.stroke();
  Y += r(24);

  // News Headline (Title) - Extra bold modern sans-serif
  const titleY = Y;
  ctx.font = font.serif(28, true); ctx.fillStyle = colors.text; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const tLines = wrap(ctx, data.title || "Headline", CW);
  const tLH = r(34 * config.fontScale);
  tLines.forEach((l, i) => ctx.fillText(l, CX, Y + i * tLH));
  const headlineH = Math.max(tLines.length * tLH, r(24));
  bounds.push({ id: "title", label: "Headline", x: CX, y: titleY, w: CW, h: headlineH });
  Y += headlineH + r(14);

  // Draw Pills under headline: Impact, Sentiment & Affected Assets
  let pillX = CX;
  const pillY = Y;
  const tfH = r(22);
  
  if (data.impact) {
    const impText = `${data.impact.toUpperCase()} IMPACT`;
    ctx.font = font.label(8.5, true);
    const tfW = ctx.measureText(impText).width + r(14);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = data.impact === "High" ? "#EF4444" : data.impact === "Medium" ? "#F97316" : colors.muted;
    ctx.fill();
    
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(impText, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(8);
  }

  if (data.sentiment) {
    const sentText = data.sentiment.toUpperCase();
    ctx.font = font.label(8.5, true);
    const tfW = ctx.measureText(sentText).width + r(14);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = data.sentiment === "Bullish" ? "#22C55E" : data.sentiment === "Bearish" ? "#EF4444" : colors.muted;
    ctx.fill();
    
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sentText, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(8);
  }

  if (data.affectedAssets) {
    const assetsText = data.affectedAssets.toUpperCase();
    ctx.font = font.label(8.5, true);
    const tfW = ctx.measureText(assetsText).width + r(14);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(assetsText, pillX + tfW / 2, pillY + tfH / 2);
  }
  Y += tfH + r(20);

  // News Image - Constant Height
  let imgH = 0;
  if (img) {
    imgH = r(245);
    const imgY = Y;
    rrect(ctx, CX, Y, CW, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
    
    ctx.save();
    rrect(ctx, CX + r(1), Y + r(1), CW - r(2), imgH - r(2), r(4));
    ctx.clip();
    
    // Cover crop
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
    
    bounds.push({ id: "imageUrl", label: "News Image", x: CX, y: imgY, w: CW, h: imgH });
    Y += imgH + r(20);
  }

  // News Description & Takeaways - dynamic heights scaling to fill remaining empty space!
  const FY = H - PAD - GUT;
  const footerSpace = r(28) + r(14);
  const totalContentH = FY - Y - footerSpace;

  if (totalContentH > 0) {
    const sections: { id: string; label: string; text: string; share: number; cardH: number }[] = [];
    if (data.description) sections.push({ id: "description", label: "◆ DETAILED ANALYSIS", text: data.description, share: 0.65, cardH: 0 });
    if (data.keyTakeaway)  sections.push({ id: "keyTakeaway",  label: "◆ KEY TAKEAWAYS & MARKET BIAS", text: data.keyTakeaway,  share: 0.35, cardH: 0 });
    
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
  ctx.fillText(data.date || "TODAY", CX, FY - r(5));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent;
  ctx.fillText("stratix.app", CXR, FY - r(5));
  bounds.push({ id: "footer", label: "Footer", x: CX, y: FY - r(14), w: CW, h: r(28) });

  return bounds;
}
