ZX.downloadBlob = function (blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
};

ZX.exportOne = async function (photo, dirHandle = null) {
  const out = document.createElement("canvas");
  ZX.draw(photo, out);
  const blob = await new Promise(resolve => out.toBlob(resolve, "image/png"));
  const name = photo.name.replace(/\.[^.]+$/, "") + "-covered.png";
  if (!dirHandle) return ZX.downloadBlob(blob, name);
  const file = await dirHandle.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
};

ZX.exportProject = function () {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    photos: ZX.photos.map(p => ({ name: p.name, width: p.img.width, height: p.img.height, items: p.items }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  ZX.downloadBlob(blob, `zhuxishe-face-cover-${Date.now()}.json`);
};

ZX.importProject = function (file) {
  const reader = new FileReader();
  reader.onload = () => {
    const data = JSON.parse(reader.result);
    for (const saved of data.photos || []) {
      const p = ZX.photos.find(x => x.name === saved.name);
      if (p) p.items = saved.items || [];
    }
    ZX.selectedItemId = "";
    ZX.pushHistory();
    ZX.renderPhotoList();
    ZX.renderCurrent();
  };
  reader.readAsText(file);
};

ZX.bindEvents = function () {
  ZX.els.photoInput.onchange = e => ZX.addFiles(e.target.files);
  ZX.els.projectInput.onchange = e => e.target.files[0] && ZX.importProject(e.target.files[0]);
  document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => {
    ZX.activeKind = btn.dataset.kind;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === btn));
    const first = ZX.assets.find(x => x.type === ZX.activeKind);
    if (first) ZX.selectedAssetId = first.id;
    ZX.renderAssetGrid();
  });
  ZX.els.canvas.addEventListener("pointerdown", evt => {
    const p = ZX.currentPhoto();
    if (!p) return;
    const pt = ZX.canvasPoint(evt);
    const item = ZX.hitItem(p, pt.x, pt.y);
    if (item) {
      ZX.selectedItemId = item.id;
      ZX.drag = { type: "item", dx: pt.x - item.x, dy: pt.y - item.y };
      ZX.syncControls();
      ZX.draw();
    } else if (ZX.selectedItemId) {
      ZX.selectedItemId = "";
      ZX.syncControls();
      ZX.draw();
    } else {
      ZX.addItemAt(pt.x, pt.y);
    }
  });
  window.addEventListener("pointermove", evt => {
    const item = ZX.selectedItem();
    if (!ZX.drag || !item) return;
    const pt = ZX.canvasPoint(evt);
    item.x = pt.x - ZX.drag.dx;
    item.y = pt.y - ZX.drag.dy;
    ZX.draw();
  });
  window.addEventListener("pointerup", () => {
    if (ZX.drag) ZX.pushHistory();
    ZX.drag = null;
  });
  ZX.els.canvas.addEventListener("wheel", evt => {
    const item = ZX.selectedItem();
    if (!item) return;
    evt.preventDefault();
    item.size = Math.max(24, Math.min(620, item.size + (evt.deltaY < 0 ? 8 : -8)));
    ZX.syncControls();
    ZX.draw();
  }, { passive: false });
  ZX.els.sizeRange.oninput = () => {
    const item = ZX.selectedItem();
    if (item) item.size = Number(ZX.els.sizeRange.value);
    ZX.syncControls();
    ZX.draw();
  };
  ZX.els.sizeRange.onchange = ZX.pushHistory;
  ZX.els.rotRange.oninput = () => {
    const item = ZX.selectedItem();
    if (item) item.rot = Number(ZX.els.rotRange.value);
    ZX.syncControls();
    ZX.draw();
  };
  ZX.els.rotRange.onchange = ZX.pushHistory;
};

ZX.finishEvents = function () {
  document.getElementById("deleteItem").onclick = () => {
    const p = ZX.currentPhoto();
    if (!p || !ZX.selectedItemId) return;
    p.items = p.items.filter(x => x.id !== ZX.selectedItemId);
    ZX.selectedItemId = "";
    ZX.pushHistory();
    ZX.renderPhotoList();
    ZX.draw();
  };
  document.getElementById("bringFront").onclick = () => ZX.reorderSelected("front");
  document.getElementById("sendBack").onclick = () => ZX.reorderSelected("back");
  document.getElementById("undoBtn").onclick = () => ZX.restoreHistory(-1);
  document.getElementById("redoBtn").onclick = () => ZX.restoreHistory(1);
  document.getElementById("exportProject").onclick = ZX.exportProject;
  document.getElementById("exportCurrent").onclick = () => ZX.currentPhoto() && ZX.exportOne(ZX.currentPhoto());
  document.getElementById("exportAll").onclick = async () => {
    if (!window.showDirectoryPicker) {
      alert("当前浏览器不支持批量写入文件夹，请用 Chrome/Edge，或逐张导出当前照片。");
      return;
    }
    const handle = await window.showDirectoryPicker().catch(() => null);
    if (!handle) return;
    for (const p of ZX.photos) await ZX.exportOne(p, handle);
  };
  document.getElementById("clearPhotos").onclick = ZX.clearPhotos;
};
