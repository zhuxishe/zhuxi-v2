ZX.addFiles = async function (files) {
  const remaining = Math.max(0, ZX.maxPhotos - ZX.photos.length);
  const images = [...files]
    .filter(file => file.type.startsWith("image/") && file.size <= ZX.maxFileBytes)
    .slice(0, remaining);
  for (const file of images) {
    const url = URL.createObjectURL(file);
    try {
      ZX.photos.push({
        id: crypto.randomUUID(),
        name: file.name,
        url,
        img: await ZX.loadImage(url),
        items: []
      });
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  if (images.length !== files.length) ZX.setStatus("部分文件因格式、大小或数量限制被跳过。");
  if (ZX.current === -1 && ZX.photos.length) ZX.current = 0;
  ZX.pushHistory();
  ZX.renderPhotoList();
  ZX.renderCurrent();
};

ZX.clearPhotos = function () {
  for (const p of ZX.photos) {
    if (p.url?.startsWith("blob:")) URL.revokeObjectURL(p.url);
  }
  ZX.photos.length = 0;
  ZX.current = -1;
  ZX.selectedItemId = "";
  ZX.history.length = 0;
  ZX.historyIndex = -1;
  ZX.renderPhotoList();
  ZX.renderCurrent();
};

ZX.renderCurrent = function () {
  const p = ZX.currentPhoto();
  ZX.els.emptyState.hidden = Boolean(p);
  ZX.els.canvas.hidden = !p;
  if (!p) {
    ZX.els.currentName.textContent = "未选择照片";
    ZX.setStatus("请选择照片开始。");
    return;
  }
  ZX.els.currentName.textContent = p.name;
  ZX.setStatus(`${ZX.photos.length} 张照片，${p.items.length} 个素材。`);
  ZX.fitCanvas();
  ZX.draw();
  ZX.syncControls();
};

ZX.renderPhotoList = function () {
  ZX.els.photoList.innerHTML = "";
  ZX.photos.forEach((p, index) => {
    const div = document.createElement("button");
    const img = document.createElement("img");
    const span = document.createElement("span");
    div.className = `photo ${index === ZX.current ? "active" : ""}`;
    img.src = p.url;
    img.alt = "";
    span.append(document.createTextNode(p.name), document.createElement("br"));
    span.append(document.createTextNode(`${p.items.length} 个素材`));
    div.onclick = () => {
      ZX.current = index;
      ZX.selectedItemId = "";
      ZX.renderPhotoList();
      ZX.renderCurrent();
    };
    div.append(img, span);
    ZX.els.photoList.appendChild(div);
  });
};

ZX.renderAssetGrid = function () {
  ZX.els.assetGrid.innerHTML = "";
  for (const asset of ZX.assets.filter(x => x.type === ZX.activeKind)) {
    const btn = document.createElement("button");
    const img = document.createElement("img");
    btn.className = `asset ${asset.id === ZX.selectedAssetId ? "active" : ""}`;
    btn.title = asset.label;
    img.src = asset.src;
    img.alt = asset.label;
    btn.onclick = () => {
      ZX.selectedAssetId = asset.id;
      ZX.selectedItemId = "";
      ZX.renderAssetGrid();
      ZX.syncControls();
      ZX.draw();
    };
    btn.appendChild(img);
    ZX.els.assetGrid.appendChild(btn);
  }
};

ZX.addItemAt = function (x, y) {
  const p = ZX.currentPhoto();
  const asset = ZX.getAsset(ZX.selectedAssetId);
  if (!p || !asset) return;
  const item = {
    id: crypto.randomUUID(),
    assetId: asset.id,
    x,
    y,
    size: Number(ZX.els.sizeRange.value) || asset.defaultSize || 120,
    rot: Number(ZX.els.rotRange.value) || 0
  };
  p.items.push(item);
  ZX.selectedItemId = item.id;
  ZX.pushHistory();
  ZX.renderPhotoList();
  ZX.setStatus(`${ZX.photos.length} 张照片，${p.items.length} 个素材。`);
  ZX.syncControls();
  ZX.draw();
};

ZX.syncControls = function () {
  const item = ZX.selectedItem();
  if (item) {
    ZX.els.sizeRange.value = item.size;
    ZX.els.rotRange.value = item.rot || 0;
  }
  ZX.els.sizeLabel.textContent = ZX.els.sizeRange.value;
  ZX.els.rotLabel.textContent = `${ZX.els.rotRange.value}°`;
};
