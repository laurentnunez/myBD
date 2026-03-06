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
  loadBD(); // premier rendu
};
openReq.onerror = () => {
  console.error("Erreur d'ouverture IndexedDB");
};

/* =========================================================
   État UI / Filtres / Import ISBN
   ========================================================= */
let currentFilter = "all";              // filtre par statut
let importedCoverDataURL = "";          // couverture importée (base64)
const listEl = document.getElementById("bdList");
const modalEl = document.getElementById("modal");

/* =========================================================
   Utilitaires
   ========================================================= */
function escapeHTML(s) {
  return (s || "").toString().replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[m]));
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
   Rendu de la liste (avec filtre)
   ========================================================= */
function loadBD() {
  if (!db) return;
  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");
  const req = store.getAll();

  req.onsuccess = () => {
    const items = req.result || [];
    if (listEl) listEl.innerHTML = "";

    items
      .filter((bd) => currentFilter === "all" || bd.status === currentFilter)
      .forEach((bd) => {
        const card = document.createElement("div");
        card.className = "bd-card";

        const coverHTML = bd.cover
          ? `<img class="bd-cover" src="${escapeHTML(bd.cover)}" alt="Couverture de ${escapeHTML(bd.title)}" loading="lazy">`
          : `<div class="bd-cover" aria-label="Pas de couverture"></div>`;

        card.innerHTML = `
          ${coverHTML}
          <div>
            <h3>${escapeHTML(bd.title)}</h3>
            <p><strong>Auteur :</strong> ${escapeHTML(bd.author)}</p>
            <p><strong>Dessinateur :</strong> ${escapeHTML(bd.artist || "")}</p>
            <p><strong>Éditeur :</strong> ${escapeHTML(bd.editor || "")}</p>
            <p><strong>Date :</strong> ${escapeHTML(bd.date || "")}</p>
            <p><strong>Statut :</strong> ${formatStatus(bd.status)}</p>
            <div class="bd-actions">
              <button class="btn" onclick="editBD(${bd.id})">✏️ Modifier</button>
              <button class="btn" onclick="deleteBD(${bd.id})">🗑️ Supprimer</button>
            </div>
          </div>
        `;
        listEl && listEl.appendChild(card);
      });
  };
}

/* =========================================================
   CRUD : supprimer / éditer
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

    // Pré-remplir le formulaire
    byId("titleInput").value  = bd.title || "";
    byId("authorInput").value = bd.author || "";
    byId("artistInput").value = bd.artist || "";
    byId("editorInput").value = bd.editor || "";
    byId("dateInput").value   = bd.date || "";
    byId("statusInput").value = bd.status || "a_lire";

    // Couverture (si pas de nouvelle image à l’enregistrement, on réutilise celle-ci)
    importedCoverDataURL = bd.cover || "";

    // Stocker l’ID édité dans la modale
    if (modalEl) modalEl.dataset.editId = String(id);

    // Ouvrir la modale
    openModal();
  };
}
window.editBD = editBD;

/* =========================================================
   DOM helpers / Modal
   ========================================================= */
function byId(id) { return document.getElementById(id); }

function openModal() {
  if (!modalEl) return;
  modalEl.classList.remove("hidden");
  modalEl.setAttribute("aria-hidden", "false");
}
function closeModal() {
  if (!modalEl) return;
  modalEl.classList.add("hidden");
  modalEl.setAttribute("aria-hidden", "true");
  delete modalEl.dataset.editId;
}

const addBtn = byId("addButton");
const cancelBtn = byId("cancelButton");
if (addBtn) addBtn.onclick = () => openModal();
if (cancelBtn) cancelBtn.onclick = () => { resetForm(); closeModal(); };

/* =========================================================
   Enregistrer (création + modification)
   ========================================================= */
const saveBtn = byId("saveButton");
if (saveBtn) {
  saveBtn.onclick = async () => {
    try {
      const file = byId("coverInput")?.files?.[0];
      let cover = "";

      if (file) {
        cover = await toBase64(file);
      } else if (importedCoverDataURL) {
        cover = importedCoverDataURL;
      }

      const bd = {
        title:  byId("titleInput").value,
        author: byId("authorInput").value,
        artist: byId("artistInput").value,
        editor: byId("editorInput").value,
        date:   byId("dateInput").value,
        status: byId("statusInput").value,
        cover
      };

      const editId = modalEl?.dataset?.editId;

      if (editId) {
        // --------- MODE MODIFICATION ----------
        bd.id = Number(editId);
        const tx = db.transaction("bd", "readwrite");
        tx.objectStore("bd").put(bd);
        tx.oncomplete = () => {
          try { loadBD(); } catch {}
          try { resetForm(); } catch {}
          importedCoverDataURL = "";
          closeModal();
        };
      } else {
        // --------- MODE CREATION -------------
        const tx = db.transaction("bd", "readwrite");
        tx.objectStore("bd").add(bd);
        tx.oncomplete = () => {
          try { loadBD(); } catch {}
          try { resetForm(); } catch {}
          importedCoverDataURL = "";
          closeModal();
        };
      }
    } catch (e) {
      console.error("Erreur lors de l’enregistrement :", e);
      // On ferme quand même la modale pour éviter le blocage visuel
      closeModal();
    }
  };
}

/* =========================================================
   Reset du formulaire
   ========================================================= */
function resetForm() {
  const ids = [
    "titleInput","authorInput","artistInput","editorInput",
    "dateInput","isbnInput","coverInput"
  ];
  ids.forEach((id) => {
    const el = byId(id);
    if (!el) return;
    if (el.tagName === "INPUT" && el.type === "file") el.value = "";
    else el.value = "";
  });
  const statusEl = byId("statusInput");
  if (statusEl) statusEl.value = "a_lire";
  importedCoverDataURL = "";
}

/* =========================================================
   Filtres par statut (si la barre existe)
   ========================================================= */
const filterButtons = document.querySelectorAll(".filter-btn");
if (filterButtons && filterButtons.length) {
  // Activer "Tout" par défaut
  let defaultBtn = Array.from(filterButtons).find((b) => b.dataset.filter === "all") || filterButtons[0];
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
   Import ISBN : Google Books (clé) → Open Library (fallback)
   ========================================================= */
const isbnInput = byId("isbnInput");
const importBtn = byId("importIsbnBtn");
const importHint = byId("importHint");

async function importFromGoogleBooksByISBN(isbn) {
  const apiKey = "AIzaSyA5B3tNy65krib-Y7DWpR1U01X1cOxMMiI"; // ⚠️ remplace par ta clé et restreins-la par referer
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1&key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Requête Google Books en échec");
  const data = await r.json();
  if (!data.items || !data.items.length) throw new Error("Aucun résultat Google Books");

  const info = data.items[0].volumeInfo || {};
  byId("titleInput").value  = info.title || "";
  byId("authorInput").value = (info.authors || []).join(", ");
  byId("artistInput").value = ""; // non distingué par Google
  byId("editorInput").value = info.publisher || "";
  byId("dateInput").value   = normalizeDate(info.publishedDate || "");

  importedCoverDataURL = "";
  const img = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  if (img) {
    const httpsUrl = img.replace("http://", "https://").replace("&edge=curl", "");
    try { importedCoverDataURL = await urlToDataURL(httpsUrl); } catch {}
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
      if (!byId("dateInput").value)  byId("dateInput").value = normalizeDate(meta.publish_date || "");
    }
  } catch {}

  // Couverture (S/M/L → on prend L)
  try {
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;
    const res = await fetch(coverUrl, { method: "GET" });
    if (res.ok) importedCoverDataURL = await urlToDataURL(coverUrl);
  } catch {}
}

if (importBtn) {
  importBtn.addEventListener("click", async () => {
  const raw = (isbnInput?.value || "").trim();
  const isbn = raw.replace(/[-\s]/g, "");
  if (!isbn) {
    alert("Saisis un ISBN (10 ou 13 chiffres).");
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
        ? "Métadonnées importées. Couverture trouvée ✅"
        : "Métadonnées importées (pas de couverture)";
    }

    // ❌ On NE met plus openModal() ici
    // 👉 L’utilisateur pourra cliquer “Ajouter une BD” ensuite

  } catch (e) {
    if (importHint) importHint.textContent = "Aucun résultat trouvé. Vérifie l'ISBN.";
  }
});

}

/* =========================================================
   Fin du fichier
   ========================================================= */