ZX.reorderSelected = function (mode) {
  const p = ZX.currentPhoto();
  const item = ZX.selectedItem();
  if (!p || !item) return;
  p.items = p.items.filter(x => x.id !== item.id);
  if (mode === "front") p.items.push(item);
  else p.items.unshift(item);
  ZX.pushHistory();
  ZX.draw();
};

ZX.bindShortcuts = function () {
  window.addEventListener("keydown", evt => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const item = ZX.selectedItem();
    if ((evt.key === "Delete" || evt.key === "Backspace") && item) {
      evt.preventDefault();
      document.getElementById("deleteItem").click();
      return;
    }
    if (!item || !evt.key.startsWith("Arrow")) return;
    const step = evt.shiftKey ? 10 : 2;
    if (evt.key === "ArrowLeft") item.x -= step;
    if (evt.key === "ArrowRight") item.x += step;
    if (evt.key === "ArrowUp") item.y -= step;
    if (evt.key === "ArrowDown") item.y += step;
    evt.preventDefault();
    ZX.draw();
  });
  window.addEventListener("keyup", evt => {
    if (evt.key.startsWith("Arrow") && ZX.selectedItem()) ZX.pushHistory();
  });
};

ZX.bindDrop = function () {
  ["dragenter", "dragover"].forEach(name => {
    ZX.els.dropZone.addEventListener(name, evt => {
      evt.preventDefault();
      ZX.els.dropZone.classList.add("dropHot");
    });
  });
  ["dragleave", "drop"].forEach(name => {
    ZX.els.dropZone.addEventListener(name, evt => {
      evt.preventDefault();
      ZX.els.dropZone.classList.remove("dropHot");
    });
  });
  ZX.els.dropZone.addEventListener("drop", evt => ZX.addFiles(evt.dataTransfer.files));
};

ZX.bindCleanup = function () {
  window.addEventListener("beforeunload", () => {
    for (const p of ZX.photos) {
      if (p.url?.startsWith("blob:")) URL.revokeObjectURL(p.url);
    }
  });
};

ZX.start = async function () {
  ZX.initEls();
  await ZX.hydrateAssets();
  ZX.renderAssetGrid();
  ZX.bindEvents();
  ZX.finishEvents();
  ZX.bindShortcuts();
  ZX.bindDrop();
  ZX.bindCleanup();
  window.addEventListener("resize", () => ZX.renderCurrent());
  ZX.setStatus("素材库已载入，请选择照片。");
};

ZX.start().catch(err => {
  console.error(err);
  alert("工作台初始化失败：" + (err.message || err));
});
