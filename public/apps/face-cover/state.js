window.ZX = {
  photos: [],
  assets: [],
  activeKind: "face",
  current: -1,
  selectedAssetId: "",
  selectedItemId: "",
  drag: null,
  history: [],
  historyIndex: -1,
  els: {}
};

ZX.initEls = function () {
  const ids = [
    "photoInput", "projectInput", "photoList", "assetGrid", "canvas",
    "emptyState", "currentName", "statusText", "dropZone", "sizeRange",
    "rotRange", "sizeLabel", "rotLabel"
  ];
  for (const id of ids) ZX.els[id] = document.getElementById(id);
  ZX.ctx = ZX.els.canvas.getContext("2d");
};

ZX.loadImage = function (src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

ZX.hydrateAssets = async function () {
  const items = window.ZX_ASSETS?.assets || [];
  const loaded = await Promise.allSettled(items.map(async item => ({
    ...item,
    img: await ZX.loadImage(item.src)
  })));
  ZX.assets = loaded.filter(x => x.status === "fulfilled").map(x => x.value);
  if (!ZX.assets.length) throw new Error("没有可用素材，请检查 assets 文件夹。");
  ZX.selectedAssetId = ZX.assets[0]?.id || "";
};

ZX.currentPhoto = function () {
  return ZX.photos[ZX.current] || null;
};

ZX.selectedItem = function () {
  const p = ZX.currentPhoto();
  return p?.items.find(item => item.id === ZX.selectedItemId) || null;
};

ZX.getAsset = function (id) {
  return ZX.assets.find(asset => asset.id === id) || ZX.assets[0];
};

ZX.setStatus = function (text) {
  ZX.els.statusText.textContent = text;
};

ZX.pushHistory = function () {
  const payload = ZX.photos.map(p => ({ id: p.id, name: p.name, items: p.items }));
  const snapshot = JSON.stringify(payload);
  if (ZX.history[ZX.historyIndex] === snapshot) return;
  ZX.history = ZX.history.slice(0, ZX.historyIndex + 1);
  ZX.history.push(snapshot);
  ZX.historyIndex = ZX.history.length - 1;
};

ZX.restoreHistory = function (delta) {
  const next = ZX.historyIndex + delta;
  if (next < 0 || next >= ZX.history.length) return;
  ZX.historyIndex = next;
  const saved = JSON.parse(ZX.history[ZX.historyIndex]);
  for (const p of ZX.photos) {
    const hit = saved.find(x => x.id === p.id);
    if (hit) p.items = hit.items || [];
  }
  ZX.selectedItemId = "";
  ZX.renderPhotoList();
  ZX.draw();
};
