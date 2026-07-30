import type { PosterElement, LogoPosition } from "../types";
import { rrect } from "./canvasUtils";

export function drawWatermarkPoster(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: (n: number) => number,
  activeNewsIndex: number = 0,
  totalNewsCount: number = 1
): PosterElement[] {
  ctx.clearRect(0, 0, W, H);

  // 1. Draw Image background if loaded
  if (img && img.complete && img.naturalWidth > 0) {
    const focusX = typeof data?.imageFocusX === "number" ? data.imageFocusX : 0.5;
    const focusY = typeof data?.imageFocusY === "number" ? data.imageFocusY : 0.5;
    const zoom = typeof data?.imageZoom === "number" ? data.imageZoom : 1;

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const canvasAspect = W / H;
    const imgAspect = imgW / imgH;

    ctx.save();
    if (zoom === 1 && Math.abs(canvasAspect - imgAspect) < 0.05) {
      // Direct 1-to-1 draw for exact dimensions with zero side cuts!
      ctx.drawImage(img, 0, 0, W, H);
    } else {
      let drawW: number, drawH: number;
      if (imgAspect > canvasAspect) {
        drawH = H * zoom;
        drawW = drawH * imgAspect;
      } else {
        drawW = W * zoom;
        drawH = drawW / imgAspect;
      }
      const offsetX = (W - drawW) * focusX;
      const offsetY = (H - drawH) * focusY;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    }
    ctx.restore();
  } else {
    // Elegant fallback background when no image is loaded yet
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0F172A");
    grad.addColorStop(1, "#020617");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle decorative grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = r(1);
    const step = r(60);
    for (let x = 0; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Centered placeholder prompt
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = `600 ${r(20)}px "Inter", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Upload an Image to apply Stratix Logo Watermark", W / 2, H / 2);
  }

  // 2. Read Watermark settings from item or default fallbacks
  const logoPos: LogoPosition = data?.logoPosition || "top-right";
  const stratiColor = data?.stratiColor || "#000000";
  const xColor = data?.xColor || "#EF4444";
  const bgStyle = data?.watermarkBgStyle || "none";
  const logoScale = typeof data?.logoScale === "number" ? data.logoScale : 1.0;
  const showTagline = Boolean(data?.showTagline);
  const taglineText = data?.taglineText || "STRATIX";

  // 3. Compute text & badge dimensions
  const baseFontSize = r(36) * logoScale;
  ctx.font = `800 ${baseFontSize}px "Inter", sans-serif`;
  const stratiW = ctx.measureText("STRATI").width;
  const xW = ctx.measureText("X").width;
  const wordmarkW = stratiW + xW;

  let taglineW = 0;
  const taglineFontSize = r(11) * logoScale;
  if (showTagline) {
    ctx.font = `700 ${taglineFontSize}px "Inter", sans-serif`;
    taglineW = ctx.measureText(taglineText).width;
  }

  const contentW = Math.max(wordmarkW, taglineW);
  const contentH = showTagline ? baseFontSize + r(4) + taglineFontSize : baseFontSize;

  const padX = bgStyle === "none" ? 0 : r(18) * logoScale;
  const padY = bgStyle === "none" ? 0 : r(10) * logoScale;
  const badgeW = contentW + padX * 2;
  const badgeH = contentH + padY * 2;

  const margin = r(36);

  // Position calculation
  let badgeX = W - badgeW - margin;
  let badgeY = margin;

  if (logoPos === "custom" && typeof data?.logoCustomX === "number" && typeof data?.logoCustomY === "number") {
    badgeX = Math.max(0, Math.min(W - badgeW, data.logoCustomX * W));
    badgeY = Math.max(0, Math.min(H - badgeH, data.logoCustomY * H));
  } else {
    switch (logoPos) {
      case "top-left":
        badgeX = margin;
        badgeY = margin;
        break;
      case "top-center":
        badgeX = (W - badgeW) / 2;
        badgeY = margin;
        break;
      case "top-right":
        badgeX = W - badgeW - margin;
        badgeY = margin;
        break;
      case "bottom-left":
        badgeX = margin;
        badgeY = H - badgeH - margin;
        break;
      case "bottom-center":
        badgeX = (W - badgeW) / 2;
        badgeY = H - badgeH - margin;
        break;
      case "bottom-right":
        badgeX = W - badgeW - margin;
        badgeY = H - badgeH - margin;
        break;
      case "center":
        badgeX = (W - badgeW) / 2;
        badgeY = (H - badgeH) / 2;
        break;
    }
  }

  // Draw background badge pill according to selected style
  ctx.save();
  if (bgStyle === "glass") {
    rrect(ctx, badgeX, badgeY, badgeW, badgeH, r(14));
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = r(1.5);
    ctx.stroke();
    // Drop shadow under pill
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = r(12);
    ctx.shadowOffsetY = r(4);
  } else if (bgStyle === "dark") {
    rrect(ctx, badgeX, badgeY, badgeW, badgeH, r(14));
    ctx.fillStyle = "rgba(10, 10, 15, 0.90)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = r(1);
    ctx.stroke();
  } else if (bgStyle === "light") {
    rrect(ctx, badgeX, badgeY, badgeW, badgeH, r(14));
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = r(10);
  } else if (bgStyle === "solid") {
    rrect(ctx, badgeX, badgeY, badgeW, badgeH, r(14));
    ctx.fillStyle = "#0F172A";
    ctx.fill();
    ctx.strokeStyle = xColor;
    ctx.lineWidth = r(2);
    ctx.stroke();
  } else if (bgStyle === "none") {
    // No background box — pure transparent background
  }
  ctx.restore();

  // Render Logo Text: STRATI + X
  const textX = badgeX + padX + (contentW - wordmarkW) / 2;
  const textY = badgeY + padY + baseFontSize * 0.82;

  ctx.save();
  if (bgStyle === "none") {
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = r(8);
    ctx.shadowOffsetY = r(2);
  }

  ctx.font = `800 ${baseFontSize}px "Inter", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Draw STRATI
  ctx.fillStyle = stratiColor;
  ctx.fillText("STRATI", textX, textY);

  // Draw X in red / xColor
  ctx.fillStyle = xColor;
  ctx.fillText("X", textX + stratiW, textY);

  // Optional Tagline below STRATIX
  if (showTagline) {
    const tagY = textY + taglineFontSize + r(4);
    ctx.font = `700 ${taglineFontSize}px "Inter", sans-serif`;
    ctx.fillStyle = stratiColor;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = "center";
    ctx.fillText(taglineText.toUpperCase(), badgeX + badgeW / 2, tagY);
  }
  ctx.restore();

  // Corner Batch Index Counter Badge (if total > 1)
  if (totalNewsCount > 1) {
    ctx.save();
    const indexBadgeW = r(64);
    const indexBadgeH = r(28);
    const indexBadgeX = W - indexBadgeW - margin;
    const indexBadgeY = H - indexBadgeH - margin;

    rrect(ctx, indexBadgeX, indexBadgeY, indexBadgeW, indexBadgeH, r(14));
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = r(1);
    ctx.stroke();

    ctx.font = `700 ${r(12)}px "Inter", sans-serif`;
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${activeNewsIndex + 1} / ${totalNewsCount}`, indexBadgeX + indexBadgeW / 2, indexBadgeY + indexBadgeH / 2);
    ctx.restore();
  }

  return [
    {
      id: "watermarkLogo",
      label: "Stratix Logo Watermark",
      x: badgeX,
      y: badgeY,
      w: badgeW,
      h: badgeH,
    },
  ];
}
