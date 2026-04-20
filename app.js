
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
let groupBySeries = false;

/* =========================================================
   Utils
========================================================= */
function byId(id) {
  return document.getElementById(id);
}

function escapeHTML(s = "") {
  return s.toString().replace(/[&<>\"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function formatTomeLabel(tome) {
  const n = Number(tome);
  return n === 0 ? "Récit complet" : `Tome ${n}`;
}

function toBase64(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

/* =========================================================
   Toast
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

  setTimeout(() => el.remove(), 5000);
}

/* =========================================================
   MODALE DÉTAIL BD — Animée
========================================================= */
function openDetailModal(bd) {
  const detail = byId("detailModal");
  const detailTomeValue = byId("detailTome");

  byId("detailSeries").textContent = bd.series ?? "";
  byId("detailTitle").textContent = bd.title ?? "";
  //byId("detailTome").textContent = formatTomeLabel(bd.tome);

  // Si tome = 0 → Récit complet sans "Tome"
  if (Number(bd.tome) === 0) {
      detailTomeValue.textContent = "Récit Complet";
  } 
  else {
      detailTomeValue.textContent = "Tome " + bd.tome;
  }


  byId("detailAuthor").textContent = bd.author ?? "";
  byId("detailArtist").textContent = bd.artist ?? "";
  byId("detailEditor").textContent = bd.editor ?? "";
  byId("detailDate").textContent = bd.date ?? "";
  byId("detailCover").src = bd.cover ?? "";

  detail.classList.remove("hidden", "hide");
  detail.classList.add("show");
  document.body.classList.add("modal-open"); 
  byId("addButton").classList.add("hidden");
  detail.dataset.bdId = bd.id;
}

function closeDetailModal() {
  const detail = byId("detailModal");
  detail.classList.remove("show");
  detail.classList.add("hide");

  setTimeout(() => {
    detail.classList.add("hidden");
    document.body.classList.remove("modal-open");
    byId("addButton").classList.remove("hidden");
  }, 250);
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

    // ----- Filtrage -----
    items = items.filter((bd) => {
      if (currentFilter === "collec") return bd.status === "a_lire" || bd.status === "lu";
      return bd.status === currentFilter;
    });

    // ----- Tri global (Série → Tome → Titre) -----
    items.sort((a, b) => {
      const sa = (a.series ?? "").toLowerCase();
      const sb = (b.series ?? "").toLowerCase();
      if (sa !== sb) return sa.localeCompare(sb, "fr", { sensitivity: "base" });
      const ta = Number(a.tome ?? 0);
      const tb = Number(b.tome ?? 0);
      if (ta !== tb) return ta - tb;
      return (a.title ?? "").localeCompare(b.title ?? "", "fr", { sensitivity: "base" });
    });

    // ----- Reset UI -----
    listEl.innerHTML = "";

    if (groupBySeries) {
      // Mode GROUPE PAR SÉRIE
      listEl.classList.remove("grid-mode", "list-mode");
      listEl.classList.add("grouped");

      // Grouping
      const groups = new Map();
      for (const bd of items) {
        const key = (bd.series && bd.series.trim()) ? bd.series.trim() : "Sans série";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(bd);
      }

      // Ordre des groupes (alpha FR)
      const groupNames = [...groups.keys()].sort((a, b) =>
        a.localeCompare(b, "fr", { sensitivity: "base" })
      );

      for (const name of groupNames) {
        const tomes = groups.get(name) ?? [];

        // Tri de sécurité par tome dans chaque groupe
        tomes.sort((a, b) => (Number(a.tome ?? 0) - Number(b.tome ?? 0)));

        // Wrapper de série
        const group = document.createElement("div");
        group.className = "series-group";

        // En-tête + compteur
        const header = document.createElement("div");
        header.className = "series-header";
        header.textContent = name;
        const count = document.createElement("span");
        count.className = "series-count";
        count.textContent = ` (${tomes.length})`;
        header.appendChild(count);
        group.appendChild(header);

        // Grille des tomes
        const grid = document.createElement("div");
        grid.className = "series-grid";

        tomes.forEach((bd) => {
          const card = document.createElement("div");
          card.className = "bd-card-grid";
          card.dataset.bdId = bd.id;

          const coverHtml = bd.cover
            ? `<img src="${escapeHTML(bd.cover)}" class="bd-cover-img" alt="Couverture">`
            : `<div class="bd-cover" aria-label="Pas de couverture"></div>`;

          const tome = formatTomeLabel(bd.tome);
          const title = escapeHTML(bd.title ?? "");
          const label = bd.title ? `${tome} • ${title}` : tome;

          const readBadge = bd.status === "lu"
            ? `<span class="read-badge">✔</span>` 
            : "";


          card.innerHTML = `
            ${coverHtml}
            ${readBadge}
            <div class="bd-card-title">${label}</div>
          `;
          card.onclick = () => openDetailModal(bd);
          grid.appendChild(card);
        });

        group.appendChild(grid);
        listEl.appendChild(group);
      }
    } else {
      // Mode ALBUM (grille simple)
      listEl.classList.remove("grouped", "list-mode");
      listEl.classList.add("grid-mode");

      items.forEach((bd) => {
        const wrap = document.createElement("div");
        wrap.className = "bd-card-grid";
        wrap.dataset.bdId = bd.id;

        const coverHtml = bd.cover
          ? `<img src="${escapeHTML(bd.cover)}" class="bd-cover-img" alt="Couverture">`
          : `<div class="bd-cover" aria-label="Pas de couverture"></div>`;

        const serie = escapeHTML(bd.series ?? "");
        const tome = formatTomeLabel(bd.tome);
        const title = escapeHTML(bd.title ?? "");
        const label = bd.title ? `${tome} • ${title}` : tome;

        const readBadge = bd.status === "lu"
          ? `<span class="read-badge">✔</span>` 
          : "";


        wrap.innerHTML = `
          ${coverHtml}
          ${readBadge}
          <div class="bd-card-title">${serie}</div>
          ${label ? `<div class="author">${label}</div>` : ""}
        `;
        wrap.onclick = () => openDetailModal(bd);
        listEl.appendChild(wrap);

      });
      updateStats({ scope: "all" });
    }
  };
}

// =========================================================
// STATISTIQUES (total collection par défaut)
// =========================================================

async function updateStats({ scope = "all" } = {}) {
  // scope: "all" = toute la collection (recommandé)
  //        "filter" = en fonction du filtre courant (collec / à_lire / lu / wishlist)

  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");

  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      let items = req.result || [];

      if (scope === "filter") {
        items = items.filter((bd) => {
          if (currentFilter === "collec") return bd.status === "a_lire" || bd.status === "lu";
          return bd.status === currentFilter;
        });
      }

      // Total BD
      const total = items.length;

      // BD lues
      const readCount = items.filter(b => b.status === "lu").length;

      // Pages lues (somme des pages des BD au status "lu")
      const pagesRead = items
        .filter(b => b.status === "lu")
        .reduce((sum, b) => sum + Number(b.pages || b.pageCount || 0), 0);

      // Push UI
      setTextSafe("statTotal", total);
      setTextSafe("statRead", readCount);
      setTextSafe("statPages", pagesRead);

      // Afficher/cacher le bloc si vide (optionnel)
      const statsArea = byId("statsArea");
      if (statsArea) {
        if (total === 0) statsArea.classList.add("hidden");
        else statsArea.classList.remove("hidden");
      }

      resolve();
    };
    req.onerror = () => resolve();
  });
}

// =========================================================
// EXPORT : IndexedDB -> JSON -> Téléchargement
// =========================================================
function exportCollection() {
  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");
  const req = store.getAll();

  req.onsuccess = () => {
    const data = req.result ?? [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mybooks_backup_${date}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast?.("Export effectué !");
  };
  req.onerror = () => showToast?.("Erreur export.", "error");
}

// =========================================================
// IMPORT : Fichier JSON -> réinjection dans IndexedDB
// =========================================================
function importCollectionFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) {
        showToast?.("Fichier invalide.", "error");
        return;
      }

      const tx = db.transaction("bd", "readwrite");
      const store = tx.objectStore("bd");

      // 1) On efface l’existant
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        // 2) On réinsère les éléments importés tels quels (avec leurs id)
        imported.forEach(item => store.put(item));
      };

      tx.oncomplete = () => {
        loadBD();                       // rafraîchit l’UI
        showToast?.("Import réussi !");
      };
      tx.onerror = () => showToast?.("Erreur import.", "error");

    } catch (e) {
      console.error(e);
      showToast?.("Erreur de lecture du fichier.", "error");
    }
  };
  reader.readAsText(file);
}


// Petit helper pour éviter les nulls
function setTextSafe(id, val) {
  const el = byId(id);
  if (el) el.textContent = String(val ?? "0");
}

/* =========================================================
   DOMContentLoaded
========================================================= */
window.addEventListener("DOMContentLoaded", () => {
  const addButton = byId("addButton");
  const modalEl = byId("modal");
  
 //Activer l'espace de sécurité sous le contenu si la barre fixe existe (mobile)
  if (window.matchMedia("(max-width: 640px)").matches && byId("bottomActions")) {
    document.body.classList.add("has-bottom-actions");
  }

 //Fonction pour l'ISBN

const isbnBtn = byId("isbnFetchButton");
const isbnInput = byId("isbnInput");

if (isbnBtn && isbnInput) {
  isbnBtn.addEventListener("click", () => {
    const isbn = isbnInput.value.replace(/[^0-9X]/gi, "").trim();
    if (!isbn) {
      showToast("Veuillez entrer un ISBN valide", "error");
      return;
    }
    handleCodeFound(isbn);
  });
}


  // === Mini-menu Sauvegarde (affiche Export / Import) ===
    const saveMenuButton = byId("saveMenuButton");
    const saveMenu = byId("saveMenu");

  if (saveMenuButton && saveMenu) {
  saveMenuButton.addEventListener("click", () => {
    saveMenu.classList.toggle("hidden");
  });

  // Clic hors menu → fermer
  document.addEventListener("click", (e) => {
    if (!saveMenu.contains(e.target) && e.target !== saveMenuButton) {
      saveMenu.classList.add("hidden");
    }
  });
  }

 

// =============================
// EXPORT
// =============================
const exportBtn = byId("exportButton");
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    exportCollection();
    saveMenu.classList.add("hidden");
    saveMenu.classList.remove("show");

  });
}

// =============================
// IMPORT (bouton -> input:file)
// =============================
const importBtn = byId("importButton");
const importInput = byId("importInput");

if (importBtn && importInput) {
  importBtn.addEventListener("click", () => {
    importInput.click();
    saveMenu.classList.add("hidden");
    saveMenu.classList.remove("show");

  });

  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file) return;
    importCollectionFromFile(file);
    // on remet l'input à zéro pour pouvoir re-sélectionner le même fichier plus tard
    importInput.value = "";
    });
  }

 const groupToggle = byId("groupBySeriesToggle");
  if (groupToggle) {
    groupBySeries = !!groupToggle.checked;     // synchro initiale si case mémorisée
    groupToggle.addEventListener("change", () => {
      groupBySeries = groupToggle.checked;
      loadBD();                                // on passe par l'unique fonction
    });
  }

 byId("pagesInput").addEventListener("input", () => {
        const el = byId("pagesInput");
        if (el.value.length > 4) {
          el.value = el.value.slice(0, 4);
        }
      });

  /* CRUD : Delete */
  window.deleteBD = function deleteBD(id) {
    const tx = db.transaction("bd", "readwrite");
    tx.objectStore("bd").delete(id);
    tx.oncomplete = loadBD;
  };

  /* CRUD : Edit */
  window.editBD = function editBD(id) {
    const tx = db.transaction("bd", "readonly");
    tx.objectStore("bd").get(id).onsuccess = (e) => {
      const bd = e.target.result;
      if (!bd) return;

      byId("seriesInput").value = bd.series ?? "";
      byId("tomeInput").value = bd.tome ?? "";
      byId("titleInput").value = bd.title ?? "";
      byId("authorInput").value = bd.author ?? "";
      byId("artistInput").value = bd.artist ?? "";
      byId("editorInput").value = bd.editor ?? "";
      byId("dateInput").value = bd.date ?? "";
      byId("statusInput").value = bd.status ?? "a_lire";
      byId("pagesInput").value = bd.pages ?? "";
      importedCoverDataURL = bd.cover ?? "";

      modalEl.dataset.editId = id;
      openModal();
    };
  };

  /* =========================================================
     Modale Ajout / Edition — Animée
  ========================================================= */
  function openModal() {
    modalEl.classList.remove("hidden", "hide");
    modalEl.classList.add("show");
    document.body.classList.add("modal-open");
    addButton.classList.add("hidden");
  }

  function closeModal() {
    modalEl.classList.remove("show");
    modalEl.classList.add("hide");

    setTimeout(() => {
      modalEl.classList.add("hidden");
      document.body.classList.remove("modal-open");
      addButton.classList.remove("hidden");
      delete modalEl.dataset.editId;
    }, 250);
  }

  addButton.onclick = openModal;
  byId("cancelButton").onclick = () => {
    resetForm();
    closeModal();
  };

  /* Boutons modale détail */
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
      series: byId("seriesInput").value,
      tome: Number(byId("tomeInput").value),
      title: byId("titleInput").value,
      author: byId("authorInput").value,
      artist: byId("artistInput").value,
      editor: byId("editorInput").value,
      date: byId("dateInput").value,
      status: byId("statusInput").value,
      pages: byId("pagesInput").value,
      cover,
      synopsis: ""  // tu as supprimé le champ, donc vide proprement
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
      req.onsuccess = (e) => (newId = e.target.result);
    }

    tx.oncomplete = () => {
      const isEdit = !!editId;

      resetForm();
      closeModal();
      loadBD();
      updateStats({ scope: "all" });
      showToast(isEdit ? "BD mise à jour !" : "BD ajoutée !", "success");

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
    ["seriesInput","tomeInput","titleInput","authorInput","artistInput","editorInput","dateInput","pagesInput"]
      .forEach((id) => {
        const el = byId(id);
        if (el) el.value = "";
      });

    byId("statusInput").value = "a_lire";
    byId("coverInput").value = "";
    byId("isbnInput").value = "";
    importedCoverDataURL = "";
  }

  /* =========================================================
     Filtres
  ========================================================= */
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) =>
        b.classList.remove("active")
      );
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      loadBD();
    });
  });

  const collectBtn = document.querySelector('[data-filter="collec"]');
  if (collectBtn) {
    document.querySelectorAll(".filter-btn").forEach((b) =>
      b.classList.remove("active")
    );
    collectBtn.classList.add("active");
  }

 // ===========================
// BOUTON POUR CHANGER L'ACCENT
// ===========================
const accentBtn = document.getElementById("accentButton");
const accentPicker = document.getElementById("accentPicker");

// Charger un accent sauvegardé
const savedAccent = localStorage.getItem("accent-color");
if (savedAccent) {
    document.documentElement.style.setProperty("--accent", savedAccent);
    accentPicker.value = savedAccent;
}

// Clic sur le bouton → ouvrir le color picker
accentBtn.addEventListener("click", () => accentPicker.click());

// Changement de couleur
accentPicker.addEventListener("input", () => {
    const color = accentPicker.value;
    document.documentElement.style.setProperty("--accent", color);
    localStorage.setItem("accent-color", color);
});


// ===========================
// RESET ACCENT COLOR
// ===========================
const resetAccentBtn = document.getElementById("resetAccentButton");

resetAccentBtn.addEventListener("click", () => {
    const defaultColor = "#4de8ba";

    // Appliquer la couleur par défaut au DOM
    document.documentElement.style.setProperty("--accent", defaultColor);

    // Mettre à jour le color picker (optionnel mais propre)
    const picker = document.getElementById("accentPicker");
    if (picker) picker.value = defaultColor;

    // Sauvegarde dans localStorage
    localStorage.setItem("accent-color", defaultColor);
});
``


});

/* =========================================================
     Fonction pour remplacer "Tome 0" par "Récit complet"
  ========================================================= */
function formatTomeLabel(tome) {
    if (tome === 0 || tome === "0") return "Récit complet";
    return `Tome ${tome}`;
  }



async function handleCodeFound(isbn) {
    showToast("Code détecté : " + isbn);

    try {
        // ✅ 1) Appel OpenLibrary (gratuit, fiable pour BD FR)
        const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);

        if (!res.ok) {
            showToast("Aucune donnée trouvée pour cet ISBN", "error");
            return;
        }

        const data = await res.json();

        // ✅ Ouvrir la modale avant de remplir
        openModal();

        // ✅ Remplissage des champs avec fallback
        byId("seriesInput").value = data.subtitle || data.title || "";
        byId("titleInput").value = data.title || "";

        if (data.authors && Array.isArray(data.authors)) {
            const authors = await Promise.all(
                data.authors.map(a =>
                    fetch(`https://openlibrary.org${a.key}.json`).then(r => r.json())
                )
            );
            byId("authorInput").value = authors.map(a => a.name).join(", ");
        } else {
            byId("authorInput").value = "";
        }

        byId("editorInput").value = data.publishers?.[0] || "";
        byId("dateInput").value = data.publish_date || "";
        byId("pagesInput").value = data.number_of_pages || "";

        // ✅ Couverture via OpenLibrary Cover API
        importedCoverDataURL =
            `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

        showToast("Données pré-remplies !");
    }
    catch (e) {
        console.error("Erreur OpenLibrary :", e);
        showToast("Impossible de récupérer les infos pour cet ISBN", "error");
    }
}


