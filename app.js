/* =========================================================
   PWA : Service Worker
   ========================================================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

/* =========================================================
   THEME SOMBRE (avec persistance)
   ========================================================= */
const THEME_KEY = "bd-theme";
const themeToggleBtn = document.getElementById("themeToggle");

function applyTheme(mode) {
  document.body.classList.toggle("dark", mode === "dark");
  themeToggleBtn.textContent = mode === "dark" ? "☀️" : "🌙";
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

let currentTheme =
  localStorage.getItem(THEME_KEY) || (systemPrefersDark() ? "dark" : "light");
applyTheme(currentTheme);

themeToggleBtn.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, currentTheme);
  applyTheme(currentTheme);
});

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

request.onsuccess = (event) => {
  db = event.target.result;
  loadBD();
};

/* =========================================================
   Variables globales
   ========================================================= */
// Filtre par défaut = "La Collec’" (À lire + Lu)
let currentFilter = "collec";

// Import ISBN dans la modale : Data URL de couverture (Option B)
let importedCoverDataURL = "";

// Mode d’affichage : grille par défaut (switch iOS => non coché = grille)
let listMode = "grid";

const modalEl = document.getElementById("modal");
const listEl = document.getElementById("bdList");
const viewModeToggle = document.getElementById("viewModeToggle");

/* =========================================================
   Utilitaires
   ========================================================= */
function byId(id) { return document.getElementById(id); }

function escapeHTML(s) {
  return (s || "").toString().replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function urlToDataURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Image introuvable");
  const blob = await res.blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

/**
 * Essaie de convertir une URL image en DataURL (base64) pour l'offline.
 * Si CORS empêche la lecture, on garde l'URL HTTPS d'origine.
 */
async function makeCoverFromUrl(url) {
  const httpsUrl = url.replace(/^http:\/\//, "https://");
  try {
    return await urlToDataURL(httpsUrl); // succès → data:image/...
  } catch {
    return httpsUrl;                      // fallback → URL directe
  }
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
   Rendu liste BD (filtre + tri + modes grille/liste)
   ========================================================= */
function loadBD() {
  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");
  const req = store.getAll();

  req.onsuccess = () => {
    let items = req.result || [];

    items = items
      .filter((bd) => {
        if (currentFilter === "collec") {
          // La Collec' = À lire + Lu
          return bd.status === "a_lire" || bd.status === "lu";
        }
        if (currentFilter === "all") return true;
        return bd.status === currentFilter;
      })
      .sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" })
      );

    listEl.innerHTML = "";

    // Applique la classe du mode d’affichage
    listEl.classList.toggle("grid-mode", listMode === "grid");
    listEl.classList.toggle("list-mode", listMode === "list");

    items.forEach((bd) => {
      const wrap = document.createElement("div");

      if (listMode === "grid") {
        // ===== Mode Grille : cover + titre + actions (compact)
        wrap.className = "bd-card-grid";
        wrap.innerHTML = `
          ${bd.cover
            ? `<img src="${escapeHTML(bd.cover)}" alt="Couverture de ${escapeHTML(bd.title || "")}" loading="lazy">`
            : `<div class="bd-cover" aria-label="Pas de couverture"></div>`}
          <div class="bd-card-title">${escapeHTML(bd.title || "")}</div>
          <div class="author">${escapeHTML(bd.author || "")}</div>
          <div class="author">${escapeHTML(bd.artist || "")}</div>
          <div class="bd-card-actions">
            <button class="btn" title="Modifier" onclick="editBD(${bd.id})">✏️</button>
            <button class="btn" title="Supprimer" onclick="deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
      } else {
        // ===== Mode Liste (L3) : cover + (titre + auteur) + actions
        wrap.className = "bd-card-list";
        wrap.innerHTML = `
          ${bd.cover
            ? `<img src="${escapeHTML(bd.cover)}" alt="Couverture de ${escapeHTML(bd.title || "")}" loading="lazy">`
            : `<div class="bd-cover" aria-label="Pas de couverture"></div>`}
          <div class="info">
            <div class="bd-card-title">${escapeHTML(bd.title || "")}</div>
            <div class="author">${escapeHTML(bd.author || "")}</div>
            <div class="author">${escapeHTML(bd.artist || "")}</div>
          </div>
          <div class="bd-card-actions">
            <button class="btn" title="Modifier" onclick="editBD(${bd.id})">✏️</button>
            <button class="btn" title="Supprimer" onclick="deleteBD(${bd.id})">🗑️</button>
          </div>
        `;
      }

      listEl.appendChild(wrap);
    });
  };
}

/* =========================================================
   Toggle Grille ↔ Liste (switch iOS)
   ========================================================= */
if (viewModeToggle) {
  // Par défaut non coché => grille
  viewModeToggle.checked = (listMode === "list");
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
  const req = tx.objectStore("bd").get(id);

  req.onsuccess = () => {
    const bd = req.result;
    if (!bd) return;

    byId("titleInput").value  = bd.title  || "";
    byId("authorInput").value = bd.author || "";
    byId("artistInput").value = bd.artist || "";
    byId("editorInput").value = bd.editor || "";
    byId("dateInput").value   = bd.date   || "";
    byId("statusInput").value = bd.status || "a_lire";

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
   Enregistrer BD (Créer / Modifier)
   ========================================================= */
byId("saveButton").onclick = async () => {
  const file = byId("coverInput").files[0];
  let cover = file ? await toBase64(file) : importedCoverDataURL;

  const bd = {
    title:  byId("titleInput").value,
    author: byId("authorInput").value,
    artist: byId("artistInput").value,
    editor: byId("editorInput").value,
    date:   byId("dateInput").value,
    status: byId("statusInput").value,
    cover
  };

  const editId = modalEl.dataset.editId;

  if (editId) {
    bd.id = Number(editId);
    const tx = db.transaction("bd", "readwrite");
    tx.objectStore("bd").put(bd);
    tx.oncomplete = () => { resetForm(); closeModal(); loadBD(); };
  } else {
    const tx = db.transaction("bd", "readwrite");
    tx.objectStore("bd").add(bd);
    tx.oncomplete = () => { resetForm(); closeModal(); loadBD(); };
  }
};

/* =========================================================
   Reset formulaire
   ========================================================= */
function resetForm() {
  ["titleInput","authorInput","artistInput","editorInput","dateInput","isbnInputModal"].forEach((id) => {
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
   Filtres par statut (incl. "La Collec'")
   ========================================================= */
const filterButtons = document.querySelectorAll(".filter-btn");
if (filterButtons && filterButtons.length) {
  // Activer visuellement "La Collec’" par défaut si présent
  const defaultBtn =
    Array.from(filterButtons).find((b) => b.dataset.filter === "collec") ||
    filterButtons[0];

  filterButtons.forEach((b) => b.classList.remove("active"));
  defaultBtn.classList.add("active");

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter || "collec";
      loadBD();
    });
  });
}

/* =========================================================
   Import ISBN (dans la modale)
   ========================================================= */
const isbnInput = byId("isbnInputModal");
const importBtn = byId("importIsbnBtnModal");
const importHint = byId("importHintModal");

async function importFromGoogleBooks(isbn) {
  const apiKey = "AIzaSyA5B3tNy65krib-Y7DWpR1U01X1cOxMMiI"; // restreins par HTTP referrer à ton GitHub Pages
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1&key=${apiKey}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Google Books KO");
  const data = await r.json();
  if (!data.items || !data.items.length) throw new Error("Aucun résultat Google Books");

  const info = data.items[0].volumeInfo || {};
  byId("titleInput").value  = info.title || "";
  byId("authorInput").value = (info.authors || []).join(", ");
  byId("editorInput").value = info.publisher || "";
  byId("dateInput").value   = normalizeDate(info.publishedDate || "");

  importedCoverDataURL = "";
  const img = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  if (img) {
    try {
      importedCoverDataURL = await makeCoverFromUrl(img);
    } catch { importedCoverDataURL = ""; }
  }
}

async function importFromOpenLibrary(isbn) {
  importedCoverDataURL = "";

  // Métadonnées minimales
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
    if (res.ok) {
      const meta = await res.json();
      if (!byId("titleInput").value)  byId("titleInput").value  = meta.title || "";
      if (!byId("editorInput").value && Array.isArray(meta.publishers) && meta.publishers.length) {
        byId("editorInput").value = meta.publishers[0];
      }
      if (!byId("dateInput").value)   byId("dateInput").value   = normalizeDate(meta.publish_date || "");
    }
  } catch {}

  // Couverture
  try {
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;
    importedCoverDataURL = await makeCoverFromUrl(coverUrl);
  } catch {}
}

if (importBtn) {
  importBtn.addEventListener("click", async () => {
    const raw  = (isbnInput?.value || "").trim();
    const isbn = raw.replace(/[-\s]/g, "");
    if (!isbn) {
      alert("Saisis un ISBN (10 ou 13 chiffres).");
      return;
    }

    importHint.textContent = "Import en cours…";

    try {
      try {
        await importFromGoogleBooks(isbn);
      } catch {
        await importFromOpenLibrary(isbn);
      }

      importHint.textContent = importedCoverDataURL
        ? "Données récupérées + couverture trouvée ✔️"
        : "Données récupérées (pas de couverture)";
    } catch {
      importHint.textContent = "Aucun résultat trouvé.";
    }
  });
}

/* =========================================================
   FIN
   ========================================================= */