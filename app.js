/* =========================================================
   PWA : Service Worker (facultatif mais recommandé)
   ========================================================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

/* =========================================================
   Thème sombre : toggle + persistance
   ========================================================= */
const THEME_KEY = "bd-theme";
const themeToggleBtn = document.getElementById("themeToggle");

function applyTheme(mode) {
  document.body.classList.toggle("dark", mode === "dark");
  if (themeToggleBtn) {
    themeToggleBtn.textContent = mode === "dark" ? "☀️" : "🌙";
  }
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

let currentTheme = localStorage.getItem(THEME_KEY) || (systemPrefersDark() ? "dark" : "light");
applyTheme(currentTheme);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, currentTheme);
    applyTheme(currentTheme);
  });
}

/* =========================================================
   IndexedDB : BDCollection / store "bd"
   ========================================================= */
let db;
const openReq = indexedDB.open("BDCollection", 1);

openReq.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains("bd")) {
    db.createObjectStore("bd", { keyPath: "id", autoIncrement: true });
  }
};

openReq.onsuccess = (event) => {
  db = event.target.result;
  loadBD();
};

openReq.onerror = () => {
  console.error("Erreur d'ouverture IndexedDB");
};

/* =========================================================
   État global UI
   ========================================================= */
let currentFilter = "all";
let importedCoverDataURL = ""; // Cover (data URL) importée par ISBN
const listEl = document.getElementById("bdList");
const modalEl = document.getElementById("modal");

/* =========================================================
   Utilitaires
   ========================================================= */
function byId(id) { return document.getElementById(id); }

function escapeHTML(s) {
  return (s || "").toString().replace(/[&<>"']/g, function (m) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m];
  });
}

function formatStatus(code) {
  const labels = { a_lire: "À lire", lu: "Lu", wishlist: "Wishlist", a_vendre: "À vendre" };
  return labels[code] || code;
}

function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function urlToDataURL(url) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Image introuvable");
  const blob = await res.blob();
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function normalizeDate(input) {
  if (!input) return "";
  if (/^\d{4}(-\d{2}){0,2}$/.test(input)) {
    if (/^\d{4}$/.test(input)) return `${input}-01-01`;
    if (/^\d{4}-\d{2}$/.test(input)) return `${input}-01`;
    return input;
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/* =========================================================
   Rendu liste BD (+ filtre + tri A→Z)
   ========================================================= */
function loadBD() {
  if (!db) return;

  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");
  const req = store.getAll();

  req.onsuccess = () => {
    const items = req.result || [];
    listEl.innerHTML = "";

    items
      .filter((bd) => currentFilter === "all" || bd.status === currentFilter)
      .sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" }))
      .forEach((bd) => {
        const card = document.createElement("div");
        card.className = "bd-card-grid";

        const coverHTML = bd.cover
          ? `<img class="bd-cover" src="${escapeHTML(bd.cover)}" alt="Couverture de ${escapeHTML(bd.title)}" loading="lazy">`
          : `<div class="bd-cover placeholder" aria-label="Pas de couverture"></div>`;

        card.innerHTML = `
          ${coverHTML}
          <div class="bd-card-title">${escapeHTML(bd.title || "")}</div>
          <div class="bd-card-actions">
            <button class="btn" title="Modifier" onclick="editBD(${bd.id})">✏️</button>
            <button class="btn" title="Supprimer" onclick="deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
        listEl.appendChild(card);
      });
  };
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
  const store = tx.objectStore("bd");
  const req = store.get(id);

  req.onsuccess = () => {
    const bd = req.result;
    if (!bd) return;

    byId("titleInput").value  = bd.title || "";
    byId("authorInput").value = bd.author || "";
    byId("artistInput").value = bd.artist || "";
    byId("editorInput").value = bd.editor || "";
    byId("dateInput").value   = bd.date || "";
    byId("statusInput").value = bd.status || "a_lire";

    // IMPORTANT: on réutilise la Data URL si aucun nouveau fichier choisi
    importedCoverDataURL = bd.cover || "";

    modalEl.dataset.editId = String(id);
    openModal();
  };
}
window.editBD = editBD;

/* =========================================================
   Modale
   ========================================================= */
function openModal() {
  modalEl.classList.remove("hidden");
  modalEl.setAttribute("aria-hidden", "false");
}
function closeModal() {
  modalEl.classList.add("hidden");
  modalEl.setAttribute("aria-hidden", "true");
  delete modalEl.dataset.editId;
}

byId("addButton").onclick = () => openModal();
byId("cancelButton").onclick = () => { resetForm(); closeModal(); };

/* =========================================================
   Enregistrer (création + modification)
   ========================================================= */
byId("saveButton").onclick = async () => {
  try {
    const file = byId("coverInput").files[0];
    let cover = "";
    if (file) cover = await toBase64(file);
    else if (importedCoverDataURL) cover = importedCoverDataURL;

    const bd = {
      title:  byId("titleInput").value,
      author: byId("authorInput").value,
      artist: byId("artistInput").value,
      editor: byId("editorInput").value,
      date:   byId("dateInput").value,
      status: byId("statusInput").value,
      cover   // <= Data URL uniquement (Option B)
    };

    const editId = modalEl.dataset.editId;

    if (editId) {
      bd.id = Number(editId);
      const tx = db.transaction("bd", "readwrite");
      tx.objectStore("bd").put(bd);
      tx.oncomplete = () => {
        loadBD();
        resetForm();
        importedCoverDataURL = "";
        closeModal();
      };
    } else {
      const tx = db.transaction("bd", "readwrite");
      tx.objectStore("bd").add(bd);
      tx.oncomplete = () => {
        loadBD();
        resetForm();
        importedCoverDataURL = "";
        closeModal();
      };
    }
  } catch (e) {
    console.error("Erreur enregistrement :", e);
    closeModal();
  }
};

/* =========================================================
   Reset formulaire
   ========================================================= */
function resetForm() {
  ["titleInput", "authorInput", "artistInput", "editorInput", "dateInput", "isbnInput"].forEach((id) => {
    const el = byId(id);
    if (el) el.value = "";
  });
  const statusEl = byId("statusInput");
  if (statusEl) statusEl.value = "a_lire";

  const fileEl = byId("coverInput");
  if (fileEl) fileEl.value = "";

  importedCoverDataURL = "";
}

/* =========================================================
   Filtres par statut
   ========================================================= */
const filterButtons = document.querySelectorAll(".filter-btn");
if (filterButtons && filterButtons.length) {
  // Activer "Tout" au lancement
  const defaultBtn = Array.from(filterButtons).find((b) => b.dataset.filter === "all") || filterButtons[0];
  defaultBtn.classList.add("active");

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter || "all";
      loadBD();
    });
  });
}

/* =========================================================
   Import ISBN — Google Books → Open Library
   ========================================================= */
const isbnInput = byId("isbnInput");
const importBtn  = byId("importIsbnBtn");
const importHint = byId("importHint");

async function importFromGoogleBooksByISBN(isbn) {
  const apiKey = "AIzaSyA5B3tNy65krib-Y7DWpR1U01X1cOxMMiI";
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1&key=${apiKey}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Échec Google Books");
  const data = await r.json();
  if (!data.items || !data.items.length) throw new Error("Aucun résultat Google Books");

  const info = data.items[0].volumeInfo || {};
  byId("titleInput").value  = info.title || "";
  byId("authorInput").value = (info.authors || []).join(", ");
  byId("editorInput").value = info.publisher || "";
  byId("dateInput").value   = normalizeDate(info.publishedDate || "");

  // Cover → Data URL (Option B)
  importedCoverDataURL = "";
  const img = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  if (img) {
    try { importedCoverDataURL = await urlToDataURL(img.replace("http://", "https://")); } catch {}
  }
}

async function importFromOpenLibraryByISBN(isbn) {
  importedCoverDataURL = "";

  // Métadonnées minimales
  try {
    const metaRes = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (!byId("titleInput").value)  byId("titleInput").value = meta.title || "";
      if (!byId("editorInput").value && Array.isArray(meta.publishers) && meta.publishers.length) {
        byId("editorInput").value = meta.publishers[0];
      }
      if (!byId("dateInput").value)   byId("dateInput").value  = normalizeDate(meta.publish_date || "");
    }
  } catch {}

  // Couverture — Data URL
  try {
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;
    const test = await fetch(coverUrl);
    if (test.ok) importedCoverDataURL = await urlToDataURL(coverUrl);
  } catch {}
}

if (importBtn) {
  importBtn.addEventListener("click", async () => {
    const raw  = (isbnInput?.value || "").trim();
    const isbn = raw.replace(/[-\s]/g, "");
    if (!isbn) {
      alert("Saisis un ISBN valide (10 ou 13 chiffres).");
      return;
    }
    if (importHint) importHint.textContent = "Import en cours…";

    try {
      try {
        await importFromGoogleBooksByISBN(isbn);
      } catch {
        await importFromOpenLibraryByISBN(isbn);
      }

      if (importHint) {
        importHint.textContent = importedCoverDataURL
          ? "Import OK — couverture trouvée ✅"
          : "Import OK — pas de couverture";
      }
      // ❌ Ne pas ouvrir la modale automatiquement

    } catch (e) {
      if (importHint) importHint.textContent = "Aucun résultat. Vérifie l'ISBN.";
    }
  });
}

/* =========================================================
   FIN
   ========================================================= */