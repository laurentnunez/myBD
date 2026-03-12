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

/* =========================================================
   Utils
========================================================= */
function byId(id) { return document.getElementById(id); }

function escapeHTML(s = "") {
  return s.toString().replace(/[&<>\"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function toBase64(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

/* =========================================================
   Toast + icône SVG accent
========================================================= */
function showToast(message, type = "success") {
  const root = document.getElementById("toastRoot") || document.body;

  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");

  const iconSuccess = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20 6L9 17l-5-5"
            stroke="#4de8ce" stroke-width="3"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  const iconError = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 4v8m0 4v2M4 12h16"
            stroke="#fff" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  el.innerHTML = `
    <span class="toast-icon">${type === "success" ? iconSuccess : iconError}</span>
    <span>${escapeHTML(message)}</span>
  `;

  root.appendChild(el);
  el.offsetHeight; 
  el.classList.add("show");

  setTimeout(() => el.remove(), 2600);
}

/* =========================================================
   MODALE DÉTAIL BD — nouvelle version
========================================================= */
function openDetailModal(bd) {
  byId("detailSeries").textContent = bd.series ?? "";
  byId("detailTitle").textContent = bd.title ?? "";
  byId("detailTome").textContent = bd.tome ?? "";
  byId("detailAuthor").textContent = bd.author ?? "";
  byId("detailArtist").textContent = bd.artist ?? "";
  byId("detailEditor").textContent = bd.editor ?? "";
  byId("detailDate").textContent = bd.date ?? "";
  byId("detailCover").src = bd.cover ?? "";

  byId("detailModal").classList.remove("hidden");
  byId("addButton").classList.add("hidden");

  byId("detailModal").dataset.bdId = bd.id;
}

function closeDetailModal() {
  byId("detailModal").classList.add("hidden");
  byId("addButton").classList.remove("hidden");
}

/* =========================================================
   Rendu liste BD
========================================================= */
function loadBD() {
  const listEl = byId("bdList");

  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");

  store.getAll().onsuccess = (e) => {
    let items = e.target.result ?? [];

    // Filtre
    items = items.filter((bd) => {
      if (currentFilter === "collec")
        return bd.status === "a_lire" || bd.status === "lu";
      return bd.status === currentFilter;
    });

    // Tri par série et par tome
    items.sort((a, b) => {
    const sa = (a.series ?? "").toLowerCase();
    const sb = (b.series ?? "").toLowerCase();

    if (sa !== sb) return sa.localeCompare(sb);

    const ta = Number(a.tome ?? 0);
    const tb = Number(b.tome ?? 0);

    if (ta !== tb) return ta - tb;

    return (a.title ?? "").localeCompare(b.title ?? "", "fr", { sensitivity: "base" });
    });

    
    // Reset UI
    listEl.innerHTML = "";
    listEl.classList.toggle("grid-mode", listMode === "grid");
    listEl.classList.toggle("list-mode", listMode === "list");

    items.forEach((bd) => {
      const wrap = document.createElement("div");
      wrap.dataset.bdId = bd.id;

      const coverHtml = bd.cover
        ? `<img src="${escapeHTML(bd.cover)}" class="bd-cover-img" alt="Couverture">`
        : `<div class="bd-cover"></div>`;


        const year = (bd.date ?? "").slice(0, 4);
        const editorYear =
          bd.editor && year ? `${escapeHTML(bd.editor)} • ${escapeHTML(year)}`
          : bd.editor ? escapeHTML(bd.editor)
          : year ? escapeHTML(year)
          : "";


const tomeTitle =
          bd.tome && bd.title ? `${escapeHTML(bd.tome)} • ${escapeHTML(bd.title)}`
          : bd.tome ? escapeHTML(bd.tome)
          : bd.title ? escapeHTML(bd.title)
          : "";


      // MODE GRILLE
      if (listMode === "grid") {
        wrap.className = "bd-card-grid";
        wrap.innerHTML = `
          ${coverHtml}
          <div class="bd-card-title">${escapeHTML(bd.series)}</div>
          ${tomeTitle ? `<div class="author">${tomeTitle}</div>` : ""}
          
          <div class="bd-card-actions">
            <button class="btn" onclick="event.stopPropagation(); editBD(${bd.id})">✏️</button>
            <button class="btn" onclick="event.stopPropagation(); deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
      }
      // MODE LISTE
      else {
        wrap.className = "bd-card-list";

        wrap.innerHTML = `
          ${coverHtml}

          <div class="info">
          <div class="bd-card-title">${escapeHTML(bd.series)}</div>
            ${tomeTitle ? `<div class="bd-card-title">${tomeTitle}</div>` : ""}
            <div class="author">${escapeHTML(bd.author ?? "")}</div>
            <div class="author">${escapeHTML(bd.artist ?? "")}</div>
            ${editorYear ? `<div class="meta">${editorYear}</div>` : ""}
          </div>

          <div class="bd-card-actions">
            <button class="btn" onclick="event.stopPropagation(); editBD(${bd.id})">✏️</button>
            <button class="btn" onclick="event.stopPropagation(); deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
      }

      // Clic sur la carte → ouvre la modale Détails
      wrap.onclick = () => openDetailModal(bd);

      listEl.appendChild(wrap);
    });
  };
}

/* =========================================================
   DOMContentLoaded
========================================================= */
window.addEventListener("DOMContentLoaded", () => {
  const viewModeToggle = byId("viewModeToggle");
  const addButton = byId("addButton");
  const modalEl = byId("modal");

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
  window.deleteBD = function deleteBD(id) {
    const tx = db.transaction("bd", "readwrite");
    tx.objectStore("bd").delete(id);
    tx.oncomplete = loadBD;
  };

  window.editBD = function editBD(id) {
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
      byId("seriesInput").value = bd.series ?? "";
      byId("tomeInput").value = bd.tome ?? "";
      importedCoverDataURL = bd.cover ?? "";

      modalEl.dataset.editId = id;
      openModal();
    };
  };

  /* =========================================================
     Modale Ajout/Édition
  ========================================================= */
  function openModal() {
    modalEl.classList.remove("hidden");
    addButton.classList.add("hidden");
  }

  function closeModal() {
    modalEl.classList.add("hidden");
    addButton.classList.remove("hidden");
    delete modalEl.dataset.editId;
  }

  addButton.onclick = openModal;

  byId("cancelButton").onclick = () => {
    resetForm();
    closeModal();
  };

  /* =========================================================
     Boutons modale Détails
  ========================================================= */
  byId("detailClose").onclick = closeDetailModal;

  byId("detailEdit").onclick = () => {
    const id = Number(byId("detailModal").dataset.bdId);
    closeDetailModal();
    editBD(id);
  };

  byId("detailDelete").onclick = () => {
    const id = Number(byId("detailModal").dataset.bdId);
    closeDetailModal();
    deleteBD(id);
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
      series: byId("seriesInput").value,
      tome: Number(byId("tomeInput").value),
      date: byId("dateInput").value,
      status: byId("statusInput").value,
      cover
    };

    const editId = modalEl.dataset.editId;
    const tx = db.transaction("bd", "readwrite");
    const store = tx.objectStore("bd");

    let newId = null;
    if (editId) {
      bd.id = Number(editId);
      store.put(bd);
    } else {
      const req = store.add(bd);
      req.onsuccess = (e) => { newId = e.target.result; };
    }

    tx.oncomplete = () => {
      const isEdit = !!editId;

      resetForm();
      closeModal();
      loadBD();

      showToast(
        isEdit ? "BD mise à jour avec succès !" : "BD ajoutée !",
        "success"
      );

      // Highlight carte ajoutée
      if (!isEdit && newId != null) {
        setTimeout(() => {
          const card = document.querySelector(`[data-bd-id="${newId}"]`);
          if (card) {
            card.classList.add("flash-highlight");
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => card.classList.remove("flash-highlight"), 1100);
          }
        }, 30);
      }
    };
  };

  /* =========================================================
     Reset Form
  ========================================================= */
  function resetForm() {
    ["titleInput","authorInput","artistInput","editorInput","dateInput"]
      .forEach(id => { const el = byId(id); if (el) el.value = ""; });

    byId("statusInput").value = "a_lire";
    byId("coverInput").value = "";
    importedCoverDataURL = "";
  }

  /* =========================================================
     Filtres
  ========================================================= */
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      loadBD();
    });
  });

  const collectBtn = document.querySelector('[data-filter="collec"]');
  if (collectBtn) {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    collectBtn.classList.add("active");
  }
});