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
const detailModalEl = document.getElementById("detailModal");
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
            <button class="btn" onclick="event.stopPropagation(); editBD(${bd.id})">✏️</button>
            <button class="btn" onclick="event.stopPropagation(); deleteBD(${bd.id})">🗑️</button>
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
            <button class="btn" onclick="event.stopPropagation(); editBD(${bd.id})">✏️</button>
            <button class="btn" onclick="event.stopPropagation(); deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
      }

      // ➜ Click card → ouvre la fiche détaillée
      wrap.onclick = () => openDetail(bd);

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
    byId("synopsisInput").value = bd.synopsis ?? "";

    importedCoverDataURL = bd.cover ?? "";

    modalEl.dataset.editId = id;
    openModal();
  };
}
window.editBD = editBD;

/* =========================================================
   Modale Ajout/Édition
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
    cover,
    synopsis: byId("synopsisInput").value
  };

  const editId = modalEl.dataset.editId;
  const tx = db.transaction("bd", "readwrite");
  const store = tx.objectStore("bd");

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
  [
    "titleInput",
    "authorInput",
    "artistInput",
    "editorInput",
    "dateInput",
    "synopsisInput"
  ].forEach((id) => byId(id).value = "");

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
   FICHE DÉTAILLÉE
========================================================= */
function openDetail(bd) {
  byId("detailTitle").textContent = bd.title ?? "";
  byId("detailAuthor").textContent = bd.author ?? "";
  byId("detailArtist").textContent = bd.artist ?? "";
  byId("detailEditor").textContent = bd.editor ?? "";
  byId("detailDate").textContent = bd.date ?? "";
  byId("detailSynopsis").textContent = bd.synopsis ?? "";
  byId("detailCover").src = bd.cover ?? "";

  detailModalEl.classList.remove("hidden");
}

byId("detailClose").onclick = () => {
  detailModalEl.classList.add("hidden");
};