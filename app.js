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

let currentTheme =
  localStorage.getItem(THEME_KEY) || (systemPrefersDark() ? "dark" : "light");

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
   État UI / global
   ========================================================= */
let currentFilter = "all";
let importedCoverDataURL = "";
const listEl = document.getElementById("bdList");
const modalEl = document.getElementById("modal");

/* =========================================================
   Utilitaires
   ========================================================= */

function byId(id) {
  return document.getElementById(id);
}

function escapeHTML(s) {
  return (s || "").toString().replace(/[&<>"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m];
  });
}

function formatStatus(code) {
  const labels = {
    a_lire: "À lire",
    lu: "Lu",
    wishlist: "Wishlist",
    a_vendre: "À vendre",
  };
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
   Rendu liste BD + filtres
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
      .forEach((bd) => {
        const card = document.createElement("div");
        card.className = "bd-card";

        const coverHTML = bd.cover
          ? `<img class="bd-cover" src="${escapeHTML(
              bd.cover
            )}" alt="Couverture de ${escapeHTML(
              bd.title
            )}" loading="lazy">`
          : `<div class="bd-cover"></div>`;

        card.innerHTML = `
          ${coverHTML}
          <div>
            <h3>${escapeHTML(bd.title)}</h3>
            <p><strong>Auteur :</strong> ${escapeHTML(bd.author)}</p>
            <p><strong>Dessinateur :</strong> ${escapeHTML(bd.artist)}</p>
            <p><strong>Éditeur :</strong> ${escapeHTML(bd.editor)}</p>
            <p><strong>Date :</strong> ${escapeHTML(bd.date)}</p>
            <p><strong>Statut :</strong> ${formatStatus(bd.status)}</p>

            <div class="bd-actions">
              <button class="btn" onclick="editBD(${bd.id})">✏️ Modifier</button>
              <button class="btn" onclick="deleteBD(${bd.id})">🗑️ Supprimer</button>
            </div>
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

    byId("titleInput").value = bd.title;
    byId("authorInput").value = bd.author;
    byId("artistInput").value = bd.artist;
    byId("editorInput").value = bd.editor;
    byId("dateInput").value = bd.date;
    byId("statusInput").value = bd.status;

    importedCoverDataURL = bd.cover || "";
    modalEl.dataset.editId = String(id);
    openModal();
  };
}
window.editBD = editBD;

/* =========================================================
   Modal
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
byId("cancelButton").onclick = () => {
  resetForm();
  closeModal();
};

/* =========================================================
   Enregistrer (Création + Modification)
   ========================================================= */

byId("saveButton").onclick = async () => {
  try {
    const file = byId("coverInput").files[0];
    let cover = "";

    if (file) cover = await toBase64(file);
    else if (importedCoverDataURL) cover = importedCoverDataURL;

    const bd = {
      title: byId("titleInput").value,
      author: byId("authorInput").value,
      artist: byId("artistInput").value,
      editor: byId("editorInput").value,
      date: byId("dateInput").value,
      status: byId("statusInput").value,
      cover,
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
  [
    "titleInput",
    "authorInput",
    "artistInput",
    "editorInput",
    "dateInput",
    "isbnInput",
  ].forEach((id) => (byId(id).value = ""));

  byId("statusInput").value = "a_lire";
  byId("coverInput").value = "";
  importedCoverDataURL = "";
}

/* =========================================================
   Filtres par statut
   ========================================================= */
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));

    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    loadBD();
  });
});

/* =========================================================
   Import ISBN - Google Books → Open Library
   ========================================================= */
const isbnInput = byId("isbnInput");
const importBtn = byId("importIsbnBtn");
const importHint = byId("importHint");

// Google Books
