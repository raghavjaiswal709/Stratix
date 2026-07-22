import type { PosterColors, PosterConfig, PosterElement } from "../types";
import type { FontFns, Rfn } from "./canvasUtils";
import { rrect, wrap } from "./canvasUtils";


export function drawChaseStylePoster(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
  mode: "analysis" | "news" | "indicator",
  activeNewsIndex: number,
  totalNewsCount: number,
  land: boolean
): PosterElement[] {
  const bounds: PosterElement[] = [];

  // Helper to shade a color (hex to hex)
  function shadeColor(color: string, percent: number) {
    const num = parseInt(color.replace("#", ""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = (num >> 8 & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
  }

  // Helper to draw torn tape
  function drawTornTape(c: CanvasRenderingContext2D, tx: number, ty: number, tw: number, th: number, angle: number) {
    c.save();
    c.translate(tx, ty);
    c.rotate(angle * Math.PI / 180);
    
    c.fillStyle = "rgba(242, 238, 224, 0.42)";
    c.strokeStyle = "rgba(242, 238, 224, 0.28)";
    c.lineWidth = 1;
    
    c.beginPath();
    const halfW = tw / 2;
    const halfH = th / 2;
    
    c.moveTo(-halfW, -halfH);
    
    // Left jagged edge
    const segments = 6;
    for (let i = 1; i <= segments; i++) {
      const py = -halfH + (th * i / segments);
      const px = -halfW + (i % 2 === 0 ? r(2) : -r(2));
      c.lineTo(px, py);
    }
    
    c.lineTo(halfW, halfH);
    
    // Right jagged edge
    for (let i = segments - 1; i >= 0; i--) {
      const py = -halfH + (th * i / segments);
      const px = halfW + (i % 2 === 0 ? -r(2) : r(2));
      c.lineTo(px, py);
    }
    
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  // Helper to wrap formatted text (supporting **bold**)
  function wrapFormattedText(c: CanvasRenderingContext2D, text: string, maxW: number, normalF: string, boldF: string): any[] {
    const parts = text.split("**");
    const tokens = parts.map((t, idx) => ({
      text: t,
      isBold: idx % 2 === 1
    }));

    const lines: any[] = [];
    let currentLine: any[] = [];
    let currentLineWidth = 0;

    tokens.forEach((token) => {
      const words = token.text.split(/(\s+)/);
      words.forEach((word) => {
        if (word === "") return;
        c.font = token.isBold ? boldF : normalF;
        const wordW = c.measureText(word).width;

        if (currentLineWidth + wordW > maxW && currentLine.length > 0 && word.trim() !== "") {
          lines.push(currentLine);
          currentLine = [];
          currentLineWidth = 0;
        }

        currentLine.push({ text: word, isBold: token.isBold });
        currentLineWidth += wordW;
      });
    });

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    return lines;
  }

  // 1. Background (Vertical linear gradient)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, colors.bg);
  bgGrad.addColorStop(1, shadeColor(colors.bg, -20));
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Analog Fine Grain Noise
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
  for (let i = 0; i < 4500; i++) {
    const nx = Math.random() * W;
    const ny = Math.random() * H;
    const nSize = Math.random() * 1.5 + 0.5;
    ctx.fillRect(nx, ny, nSize, nSize);
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.022)";
  for (let i = 0; i < 4500; i++) {
    const nx = Math.random() * W;
    const ny = Math.random() * H;
    const nSize = Math.random() * 1.5 + 0.5;
    ctx.fillRect(nx, ny, nSize, nSize);
  }
  ctx.restore();

  // 3. Vignette
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) / 3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Parse slide numbering
  let idxStr = "01";
  let totStr = "01";
  if (mode === "news") {
    idxStr = (activeNewsIndex + 1).toString().padStart(2, "0");
    totStr = totalNewsCount.toString().padStart(2, "0");
  } else {
    idxStr = (data.index || "01").toString().padStart(2, "0");
    totStr = (data.total || "08").toString().padStart(2, "0");
  }
  const slideText = `${idxStr}  /  ${totStr}`;

  const dateText = (data.date || "JULY @2026").toUpperCase();
  const brandText = (data.footer || "CHASE AI").toUpperCase();

  // Header Y
  const headY = PAD + r(10);

  // Draw Header
  ctx.font = `bold ${r(10.5)}px "Inter", sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.textBaseline = "middle";
  
  ctx.textAlign = "left";
  ctx.fillText(dateText, CX, headY);
  
  ctx.textAlign = "center";
  ctx.fillText(brandText, W / 2, headY);
  
  ctx.textAlign = "right";
  ctx.fillText(slideText, CXR, headY);
  
  bounds.push({ id: "header", label: "Header Navigation", x: CX, y: headY - r(10), w: CW, h: r(20) });

  // Footer Y
  const FY = H - PAD - r(10);

  // Draw Footer
  ctx.textAlign = "left";
  ctx.fillText(slideText, CX, FY);
  
  ctx.textAlign = "right";
  ctx.fillText("SWIPE  →", CXR, FY);
  
  const dotCount = mode === "news" ? totalNewsCount : 8;
  const activeDotIdx = mode === "news" ? activeNewsIndex : (parseInt(idxStr) - 1 || 0);

  if (dotCount > 1) {
    const dotSpacing = r(11);
    const totalDotsW = (dotCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    
    ctx.save();
    for (let i = 0; i < dotCount; i++) {
      const dotX = startDotX + i * dotSpacing;
      ctx.beginPath();
      ctx.arc(dotX, FY, r(2.5), 0, Math.PI * 2);
      ctx.fillStyle = i === activeDotIdx ? "#FFFFFF" : "rgba(255, 255, 255, 0.28)";
      ctx.fill();
    }
    ctx.restore();
  }
  bounds.push({ id: "footer", label: "Footer Navigation", x: CX, y: FY - r(10), w: CW, h: r(20) });

  // Extract description and format
  let descText = "";
  if (mode === "analysis") {
    const parts = [];
    if (data.description) parts.push(data.description);
    if (data.whatToDo) parts.push(`**What to do:** ${data.whatToDo}`);
    if (data.keyLevels) parts.push(`**Key Levels:** ${data.keyLevels}`);
    descText = parts.join(" ");
  } else if (mode === "news") {
    const parts = [];
    if (data.description) parts.push(data.description);
    if (data.keyTakeaway) parts.push(`**Key Takeaway:** ${data.keyTakeaway}`);
    descText = parts.join(" ");
  } else {
    if (data.description) {
      descText = data.description;
    }
    if (data.sections && data.sections.length > 0) {
      const secParts = data.sections.map((s: any) => `**${s.label}:** ${s.content || s.text || ""}`);
      descText = (descText ? descText + " " : "") + secParts.join(" ");
    }
  }
  descText = descText.replace(/\n+/g, " ");

  if (land) {
    // ── LANDSCAPE LAYOUT (Side-by-side)
    const midX = W / 2;
    const leftW = (midX - CX) - r(12);
    const rightW = (CXR - midX) - r(12);
    
    let Y = PAD + r(38);
    
    // Category badge
    const badgeText = (data.category || `USE CASE ${idxStr}`).toUpperCase();
    ctx.font = `900 ${r(10.5)}px "Inter", sans-serif`;
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgeW = badgeTextW + r(18);
    const badgeH = r(24);
    
    ctx.save();
    ctx.translate(CX + badgeW / 2, Y + badgeH / 2);
    ctx.rotate(-2.5 * Math.PI / 180);
    ctx.fillStyle = "#111111";
    rrect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, r(12));
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, 0, 0);
    ctx.restore();
    
    bounds.push({ id: "category", label: "Badge", x: CX, y: Y, w: badgeW, h: badgeH });
    Y += badgeH + r(14);
    
    // Title
    let rawTitle = "";
    if (mode === "analysis") {
      rawTitle = data.instrument && data.levelName ? `${data.instrument} / ${data.levelName}` : (data.instrument || data.levelName || "Untitled");
    } else {
      rawTitle = data.title || "Untitled";
    }
    rawTitle = rawTitle.toLowerCase();

    let titleLines: string[] = [];
    if (rawTitle.includes("/")) {
      titleLines = rawTitle.split("/").map(s => s.trim());
    } else {
      ctx.font = `900 ${r(34)}px "Inter", sans-serif`;
      titleLines = wrap(ctx, rawTitle, leftW);
    }
    
    let curTitleY = Y;
    const titleLH = r(38);
    titleLines.forEach((line, lineIdx) => {
      let text = line;
      if (lineIdx === titleLines.length - 1 && !text.endsWith(".")) {
        text = text + ".";
      }
      
      const isWhite = lineIdx % 2 === 0;
      ctx.font = `900 ${r(34)}px "Inter", sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      
      if (!isWhite && text.endsWith(".")) {
        const mainText = text.substring(0, text.length - 1);
        ctx.fillStyle = "#111111";
        ctx.fillText(mainText, CX, curTitleY);
        const mainTextW = ctx.measureText(mainText).width;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(".", CX + mainTextW, curTitleY);
      } else {
        ctx.fillStyle = isWhite ? "#FFFFFF" : "#111111";
        ctx.fillText(text, CX, curTitleY);
      }
      curTitleY += titleLH;
    });
    bounds.push({ id: "title", label: "Title", x: CX, y: Y, w: leftW, h: curTitleY - Y });
    Y = curTitleY + r(10);
    
    // Description
    const boldFont = `bold 700 ${r(12.5)}px "Inter", sans-serif`;
    const normalFont = `500 ${r(12.5)}px "Inter", sans-serif`;
    
    const descLines = wrapFormattedText(ctx, descText, leftW, normalFont, boldFont);
    let curDescY = Y;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    
    descLines.forEach((line) => {
      let curX = CX;
      line.forEach((item: any) => {
        ctx.font = item.isBold ? boldFont : normalFont;
        ctx.fillStyle = item.isBold ? "#FFFFFF" : "rgba(255, 255, 255, 0.85)";
        ctx.fillText(item.text, curX, curDescY);
        curX += ctx.measureText(item.text).width;
      });
      curDescY += r(18);
    });
    bounds.push({ id: "description", label: "Description", x: CX, y: Y, w: leftW, h: curDescY - Y });

    // Right side: Tilted Image Frame
    const rightCX = midX + r(12);
    const IH = Math.min(r(400), FY - PAD - r(70));
    const IY = PAD + r(40) + IH / 2;
    
    ctx.save();
    ctx.translate(rightCX + rightW / 2, IY);
    ctx.rotate(-1.5 * Math.PI / 180);
    
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = r(15);
    ctx.shadowOffsetY = r(8);
    
    ctx.fillStyle = "#FFFFFF";
    rrect(ctx, -rightW / 2, -IH / 2, rightW, IH, r(6));
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    const borderSize = r(4.5);
    const clipW = rightW - borderSize * 2;
    const clipH = IH - borderSize * 2;
    
    ctx.save();
    rrect(ctx, -rightW / 2 + borderSize, -IH / 2 + borderSize, clipW, clipH, r(4));
    ctx.clip();
    
    if (img) {
      const iAR = img.naturalWidth / img.naturalHeight;
      const fAR = clipW / clipH;
      let drawW = clipW, drawH = clipH;
      let drawX = -clipW / 2, drawY = -clipH / 2;
      
      if (iAR > fAR) {
        drawW = clipH * iAR;
        drawX = -drawW / 2;
      } else {
        drawH = clipW / iAR;
        drawY = -drawH / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(-clipW / 2, -clipH / 2, clipW, clipH);
      ctx.font = `bold ${r(12)}px "Inter", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ PLACE IMAGE HERE ]", 0, 0);
    }
    ctx.restore();
    
    // Tapes
    drawTornTape(ctx, -rightW / 2 + r(10), -IH / 2 + r(5), r(58), r(22), -35);
    drawTornTape(ctx, rightW / 2 - r(10), IH / 2 - r(5), r(58), r(22), -35);
    
    ctx.restore();
    bounds.push({ id: "imageUrl", label: "Poster Image", x: rightCX, y: IY - IH / 2, w: rightW, h: IH });
    
  } else {
    // ── PORTRAIT/SQUARE LAYOUT (Vertical)
    let Y = PAD + r(38);

    // Category badge
    const badgeText = (data.category || `USE CASE ${idxStr}`).toUpperCase();
    ctx.font = `900 ${r(10.5)}px "Inter", sans-serif`;
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgeW = badgeTextW + r(18);
    const badgeH = r(24);
    
    ctx.save();
    ctx.translate(CX + badgeW / 2, Y + badgeH / 2);
    ctx.rotate(-2.5 * Math.PI / 180);
    ctx.fillStyle = "#111111";
    rrect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, r(12));
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, 0, 0);
    ctx.restore();
    
    bounds.push({ id: "category", label: "Badge", x: CX, y: Y, w: badgeW, h: badgeH });
    Y += badgeH + r(16);

    // Title
    let rawTitle = "";
    if (mode === "analysis") {
      rawTitle = data.instrument && data.levelName ? `${data.instrument} / ${data.levelName}` : (data.instrument || data.levelName || "Untitled");
    } else {
      rawTitle = data.title || "Untitled";
    }
    rawTitle = rawTitle.toLowerCase();

    let titleLines: string[] = [];
    if (rawTitle.includes("/")) {
      titleLines = rawTitle.split("/").map(s => s.trim());
    } else {
      ctx.font = `900 ${r(42)}px "Inter", sans-serif`;
      titleLines = wrap(ctx, rawTitle, CW);
    }
    
    let curTitleY = Y;
    const titleLH = r(46);
    titleLines.forEach((line, lineIdx) => {
      let text = line;
      if (lineIdx === titleLines.length - 1 && !text.endsWith(".")) {
        text = text + ".";
      }
      
      const isWhite = lineIdx % 2 === 0;
      ctx.font = `900 ${r(42)}px "Inter", sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      
      if (!isWhite && text.endsWith(".")) {
        const mainText = text.substring(0, text.length - 1);
        ctx.fillStyle = "#111111";
        ctx.fillText(mainText, CX, curTitleY);
        const mainTextW = ctx.measureText(mainText).width;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(".", CX + mainTextW, curTitleY);
      } else {
        ctx.fillStyle = isWhite ? "#FFFFFF" : "#111111";
        ctx.fillText(text, CX, curTitleY);
      }
      curTitleY += titleLH;
    });
    bounds.push({ id: "title", label: "Title", x: CX, y: Y, w: CW, h: curTitleY - Y });
    Y = curTitleY + r(14);

    // Description
    const boldFont = `bold 700 ${r(13.5)}px "Inter", sans-serif`;
    const normalFont = `500 ${r(13.5)}px "Inter", sans-serif`;
    
    const descLines = wrapFormattedText(ctx, descText, CW - r(10), normalFont, boldFont);
    let curDescY = Y;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    
    descLines.forEach((line) => {
      let curX = CX;
      line.forEach((item: any) => {
        ctx.font = item.isBold ? boldFont : normalFont;
        ctx.fillStyle = item.isBold ? "#FFFFFF" : "rgba(255, 255, 255, 0.85)";
        ctx.fillText(item.text, curX, curDescY);
        curX += ctx.measureText(item.text).width;
      });
      curDescY += r(20);
    });
    bounds.push({ id: "description", label: "Description", x: CX, y: Y, w: CW, h: curDescY - Y });

    // Tilted image container
    const IH = Math.max(r(180), Math.min(r(290), (H - PAD - r(50)) - curDescY - r(20)));
    const IY = curDescY + r(20) + IH / 2;
    
    ctx.save();
    ctx.translate(CX + CW / 2, IY);
    ctx.rotate(-1.5 * Math.PI / 180);
    
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = r(15);
    ctx.shadowOffsetY = r(8);
    
    ctx.fillStyle = "#FFFFFF";
    rrect(ctx, -CW / 2, -IH / 2, CW, IH, r(6));
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    const borderSize = r(4.5);
    const clipW = CW - borderSize * 2;
    const clipH = IH - borderSize * 2;
    
    ctx.save();
    rrect(ctx, -CW / 2 + borderSize, -IH / 2 + borderSize, clipW, clipH, r(4));
    ctx.clip();
    
    if (img) {
      const iAR = img.naturalWidth / img.naturalHeight;
      const fAR = clipW / clipH;
      let drawW = clipW, drawH = clipH;
      let drawX = -clipW / 2, drawY = -clipH / 2;
      
      if (iAR > fAR) {
        drawW = clipH * iAR;
        drawX = -drawW / 2;
      } else {
        drawH = clipW / iAR;
        drawY = -drawH / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(-clipW / 2, -clipH / 2, clipW, clipH);
      ctx.font = `bold ${r(12)}px "Inter", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ PLACE IMAGE HERE ]", 0, 0);
    }
    ctx.restore();
    
    // Tapes
    drawTornTape(ctx, -CW / 2 + r(10), -IH / 2 + r(5), r(58), r(22), -35);
    drawTornTape(ctx, CW / 2 - r(10), IH / 2 - r(5), r(58), r(22), -35);
    
    ctx.restore();
    bounds.push({ id: "imageUrl", label: "Poster Image", x: CX, y: IY - IH / 2, w: CW, h: IH });
  }

  return bounds;
}
