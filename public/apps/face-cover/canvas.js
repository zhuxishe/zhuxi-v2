ZX.fitCanvas = function () {
  const p = ZX.currentPhoto();
  if (!p) return;
  const wrap = document.querySelector(".stageWrap");
  const maxW = Math.max(320, wrap.clientWidth - 40);
  const maxH = Math.max(320, window.innerHeight - 230);
  const scale = Math.min(maxW / p.img.width, maxH / p.img.height, 1);
  ZX.els.canvas.width = Math.round(p.img.width * scale);
  ZX.els.canvas.height = Math.round(p.img.height * scale);
  ZX.els.canvas.dataset.scale = String(scale);
};

ZX.draw = function (exportPhoto = null, target = ZX.els.canvas) {
  const p = exportPhoto || ZX.currentPhoto();
  if (!p) return;
  const exportMode = Boolean(exportPhoto);
  const scale = exportMode ? 1 : Number(target.dataset.scale || 1);
  const ctx = target.getContext("2d");
  if (exportMode) {
    target.width = p.img.width;
    target.height = p.img.height;
  }
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(p.img, 0, 0, target.width, target.height);
  for (const item of p.items) ZX.drawItem(ctx, item, scale, exportMode);
  if (!exportMode) ZX.drawSelection(ctx, scale);
};

ZX.itemBox = function (asset, item, scale = 1) {
  const w = asset.img.naturalWidth || asset.img.width || item.size;
  const h = asset.img.naturalHeight || asset.img.height || item.size;
  const ratio = w / h;
  return ratio >= 1
    ? { w: item.size * scale, h: item.size * scale / ratio }
    : { w: item.size * scale * ratio, h: item.size * scale };
};

ZX.drawItem = function (ctx, item, scale) {
  const asset = ZX.getAsset(item.assetId);
  const box = ZX.itemBox(asset, item, scale);
  ctx.save();
  ctx.translate(item.x * scale, item.y * scale);
  ctx.rotate((item.rot || 0) * Math.PI / 180);
  ctx.drawImage(asset.img, -box.w / 2, -box.h / 2, box.w, box.h);
  ctx.restore();
};

ZX.drawSelection = function (ctx, scale) {
  const item = ZX.selectedItem();
  if (!item) return;
  ctx.save();
  ctx.strokeStyle = "#e7bf45";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(item.x * scale, item.y * scale, item.size * scale / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

ZX.canvasPoint = function (evt) {
  const rect = ZX.els.canvas.getBoundingClientRect();
  const scale = Number(ZX.els.canvas.dataset.scale || 1);
  return { x: (evt.clientX - rect.left) / scale, y: (evt.clientY - rect.top) / scale };
};

ZX.hitItem = function (photo, x, y) {
  for (let i = photo.items.length - 1; i >= 0; i--) {
    const item = photo.items[i];
    const dx = x - item.x;
    const dy = y - item.y;
    if (Math.hypot(dx, dy) <= item.size * .58) return item;
  }
  return null;
};
