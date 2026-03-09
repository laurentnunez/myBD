/* =========================================================
   PWA : Service Worker
   ========================================================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

/* =========================================================
   IndexedDB
   ========================================================= */
let db;
const request = indexedDB.open("BDCollection", 1);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains("bd")) {
    db.createObjectStore("bd", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = () => {
  db = request.result;
  loadBD();
};

/* =========================================================
   Variables globales
   ========================================================= */
let currentFilter = "collec";
let importedCoverDataURL = "";
let listMode = "grid";

const modalEl = document.getElementById("modal");
const listEl = document.getElementById("bdList");
const viewModeToggle = document.getElementById("viewModeToggle");

/* =========================================================
   Utilitaires
   ========================================================= */
function byId(id) { return document.getElementById(id); }

function escapeHTML(s) {
  return (s ?? "").replace(/[&<>\"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function toBase64(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

/* =========================================================
   Rendu liste BD
   ========================================================= */
function loadBD() {
  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");

  store.getAll().onsuccess = (e) => {
    let items = e.target.result ?? [];

    // Filtre
    items = items.filter((bd) => {
      if (currentFilter === "collec") {
        return bd.status === "a_lire" || bd.status === "lu";
      }
      return bd.status === currentFilter;
    });

    // Tri
    items.sort((a, b) =>
      (a.title ?? "").localeCompare(b.title ?? "", "fr", { sensitivity: "base" })
    );

    // Reset UI
    listEl.innerHTML = "";
    listEl.classList.toggle("grid-mode", listMode === "grid");
    listEl.classList.toggle("list-mode", listMode === "list");

    // Affichage
    items.forEach((bd) => {
      const wrap = document.createElement("div");
      const coverHtml = bd.cover
        ? `<img src="${escapeHTML(bd.cover)}" loading="lazy">`
        : `<div class="bd-cover"></div>`;

      if (listMode === "grid") {
        wrap.className = "bd-card-grid";
        wrap.innerHTML = `
          ${coverHtml}
          <div class="bd-card-title">${escapeHTML(bd.title)}</div>
          <div class="author">${escapeHTML(bd.author)}</div>
          <div class="author">${escapeHTML(bd.artist)}</div>
          <div class="bd-card-actions">
            <button class="btn" onclick="editBD(${bd.id})">✏️</button>
            <button class="btn" onclick="deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
      } else {
        wrap.className = "bd-card-list";
        wrap.innerHTML = `
          ${coverHtml}
          <div class="info">
            <div class="bd-card-title">${escapeHTML(bd.title)}</div>
            <div class="author">${escapeHTML(bd.author)}</div>
            <div class="author">${escapeHTML(bd.artist)}</div>
          </div>
          <div class="bd-card-actions">
            <button class="btn" onclick="editBD(${bd.id})">✏️</button>
            <button class="btn" onclick="deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
      }

      listEl.appendChild(wrap);
    });
  };
}

/* =========================================================
   Toggle grille / liste
   ========================================================= */
if (viewModeToggle) {
  viewModeToggle.checked = listMode === "list";
  viewModeToggle.addEventListener("change", () => {
    listMode = viewModeToggle.checked ? "list" : "grid";
    loadBD();
  });
}

/* =========================================================
   CRUD
   ========================================================= */
function deleteBD(id) {
  const tx = db.transaction("bd", "readwrite");
  tx.objectStore("bd").delete(id);
  tx.oncomplete = loadBD;
}
window.deleteBD = deleteBD;

function editBD(id) {
  const tx = db.transaction("bd", "readonly");
  tx.objectStore("bd").get(id).onsuccess = (e) => {
    const bd = e.target.result;
    if (!bd) return;

    byId("titleInput").value = bd.title ?? "";
    byId("authorInput").value = bd.author ?? "";
    byId("artistInput").value = bd.artist ?? "";
    byId("editorInput").value = bd.editor ?? "";
    byId("dateInput").value = bd.date ?? "";
    byId("statusInput").value = bd.status ?? "a_lire";

    importedCoverDataURL = bd.cover ?? "";

    modalEl.dataset.editId = id;
    openModal();
  };
}
window.editBD = editBD;

/* =========================================================
   Modale
   ========================================================= */
function openModal() {
  modalEl.classList.remove("hidden");
}

function closeModal() {
  modalEl.classList.add("hidden");
  delete modalEl.dataset.editId;
}

byId("addButton").onclick = () => openModal();
byId("cancelButton").onclick = () => {
  resetForm();
  closeModal();
};

/* =========================================================
   Enregistrer BD
   ========================================================= */
byId("saveButton").onclick = async () => {
  const file = byId("coverInput").files?.[0];
  const cover = file ? await toBase64(file) : importedCoverDataURL;

  const bd = {
    title: byId("titleInput").value,
    author: byId("authorInput").value,
    artist: byId("artistInput").value,
    editor: byId("editorInput").value,
    date: byId("dateInput").value,
    status: byId("statusInput").value,
    cover
  };

  const editId = modalEl.dataset.editId;
  const tx     = db.transaction("bd", "readwrite");
  const store  = tx.objectStore("bd");

  if (editId) {
    bd.id = Number(editId);
    store.put(bd);
  } else {
    store.add(bd);
  }

  tx.oncomplete = () => {
    resetForm();
    closeModal();
    loadBD();
  };
};

/* =========================================================
   Reset formulaire
   ========================================================= */
function resetForm() {
  ["titleInput","authorInput","artistInput","editorInput","dateInput"]
    .forEach((id) => byId(id).value = "");

  byId("statusInput").value = "a_lire";
  byId("coverInput").value = "";

  importedCoverDataURL = "";
}

/* =========================================================
   Filtres
   ========================================================= */
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));

    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    loadBD();
  });
});

/* =========================================================
   Scan code‑barres (EAN-13)
   ========================================================= */
import { BrowserMultiFormatReader } from "https://unpkg.com/@zxing/library@latest/esm/index.js";

const barcodeVideo = document.getElementById("barcodeVideo");
const scanBtn      = document.getElementById("startScanBarcode");
const scanStatus   = document.getElementById("scanStatus");

let codeReader = null;
let scanning   = false;

async function startBarcodeScan() {
  if (scanning) return;
  scanning = true;

  scanStatus.textContent = "Ouverture de la caméra…";

  try {
    codeReader = new BrowserMultiFormatReader();
    const devices = await codeReader.listVideoInputDevices();

    if (!devices.length) {
      scanStatus.textContent = "❌ Aucune caméra détectée.";
      scanning = false;
      return;
    }

    const deviceId = devices[0].deviceId;

    scanStatus.textContent = "📷 Scanne en cours…";

    codeReader.decodeOnceFromVideoDevice(deviceId, barcodeVideo)
      .then((result) => {
        const ean = result.text.trim();
        scanStatus.textContent = "EAN‑13 détecté : " + ean;
        stopBarcodeScan();
      })
      .catch(() => {
        scanStatus.textContent = "❌ Impossible de lire le code‑barres.";
        stopBarcodeScan();
      });

  } catch (err) {
    scanStatus.textContent = "❌ Erreur d’accès à la caméra.";
    scanning = false;
  }
}

function stopBarcodeScan() {
  if (codeReader) codeReader.reset();
  scanning = false;
}

scanBtn?.addEventListener("click", startBarcodeScan);

modalEl.addEventListener("transitionend", () => {
  if (modalEl.classList.contains("hidden")) stopBarcodeScan();
});