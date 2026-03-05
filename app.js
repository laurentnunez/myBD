// =====================================
// PWA : enregistrement du Service Worker
// =====================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

// =====================================
// Thème sombre : toggle + persistence
// =====================================
const THEME_KEY = "bd-theme";
const themeToggleBtn = document.getElementById("themeToggle");

function applyTheme(t){
  document.body.classList.toggle("dark", t === "dark");
  // Icône
  themeToggleBtn.textContent = (t === "dark") ? "☀️" : "🌙";
}

function getSystemPref(){
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark":"light";
}

// Init thème
let savedTheme = localStorage.getItem(THEME_KEY) || getSystemPref();
applyTheme(savedTheme);

themeToggleBtn.addEventListener("click", () => {
  savedTheme = (savedTheme === "dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, savedTheme);
  applyTheme(savedTheme);
});

// =====================================
// IndexedDB
// =====================================
let db;
const request = indexedDB.open("BDCollection", 1);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  db.createObjectStore("bd", { keyPath: "id", autoIncrement: true });
};

request.onsuccess = (event) => {
  db = event.target.result;
  loadBD();
};

// =====================================
// Rendu de la liste
// =====================================
function loadBD() {
  const tx = db.transaction("bd", "readonly");
  const store = tx.objectStore("bd");
  const req = store.getAll();

  req.onsuccess = () => {
    const list = document.getElementById("bdList");
    list.innerHTML = "";

    req.result.forEach((bd) => {
      const card = document.createElement("div");
      card.className = "bd-card";

      const coverHTML = bd.cover
        ? `<img class="bd-cover" src="${bd.cover}" alt="Couverture">`
        : `<div class="bd-cover" aria-label="Pas de couverture"></div>`;

      card.innerHTML = `
        ${coverHTML}
        <div>
          <h3>${escapeHTML(bd.title)}</h3>
          <p><strong>Auteur :</strong> ${escapeHTML(bd.author)}</p>
          <p><strong>Dessinateur :</strong> ${escapeHTML(bd.artist)}</p>
          <p><strong>Éditeur :</strong> ${escapeHTML(bd.editor || "")}</p>
          <p><strong>Date :</strong> ${escapeHTML(bd.date || "")}</p>
          <p><strong>Statut :</strong> ${formatStatus(bd.status)}</p>
          <div class="bd-actions">
            <button class="btn" onclick="deleteBD(${bd.id})">🗑️ Supprimer</button>
          </div>
        </div>
      `;
      list.appendChild(card);
    });
  };
}

function escapeHTML(s){
  return (s||"").toString().replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
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

function deleteBD(id) {
  const tx = db.transaction("bd", "readwrite");
  tx.objectStore("bd").delete(id);
  tx.oncomplete = loadBD;
}
window.deleteBD = deleteBD; // pour onclick inline

// =====================================
// Modal : ouverture / fermeture
// =====================================
document.getElementById("addButton").onclick = () => {
  document.getElementById("modal").classList.remove("hidden");
};

document.getElementById("cancelButton").onclick = () => {
  document.getElementById("modal").classList.add("hidden");
  resetForm();
};

// =====================================
// Import ISBN : Google Books (clé) → Open Library (fallback)
// =====================================
let importedCoverDataURL = ""; // couverture en base64 (offline)

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
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

async function importFromGoogleBooksByISBN(isbn) {
  const apiKey = "AIzaSyA5B3tNy65krib-Y7DWpR1U01X1cOxMMiI"; // ➜ restreins par referrer (Google Books API) 
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1&key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Requête Google Books en échec");
  const data = await r.json();
  if (!data.items || data.items.length === 0) {
    throw new Error("Aucun résultat Google Books");
  }
  const info = data.items[0].volumeInfo || {};
  document.getElementById("titleInput").value  = info.title || "";
  document.getElementById("authorInput").value = (info.authors || []).join(", ");
  document.getElementById("artistInput").value = ""; // non distingué par Google Books
  document.getElementById("editorInput").value = info.publisher || "";
  document.getElementById("dateInput").value   = normalizeDate(info.publishedDate || "");

  importedCoverDataURL = "";
  const img = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  if (img) {
    const httpsUrl = img.replace("http://", "https://").replace("&edge=curl", "");
    try { importedCoverDataURL = await urlToDataURL(httpsUrl); } catch {}
  }
  return true;
}

async function importFromOpenLibraryByISBN(isbn) {
  importedCoverDataURL = "";

  // Métadonnées basiques
  try {
    const metaRes = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (!document.getElementById("titleInput").value)  document.getElementById("titleInput").value = meta.title || "";
      if (!document.getElementById("editorInput").value && Array.isArray(meta.publishers) && meta.publishers.length) {
        document.getElementById("editorInput").value = meta.publishers[0];
      }
      if (!document.getElementById("dateInput").value)  document.getElementById("dateInput").value = normalizeDate(meta.publish_date || "");
    }
  } catch {}

  // Couverture
  try {
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;
    const test = await fetch(coverUrl, { method: "GET" });
    if (test.ok) {
      importedCoverDataURL = await urlToDataURL(coverUrl);
    }
  } catch {}
}

document.getElementById("importIsbnBtn")?.addEventListener("click", async () => {
  const isbn = (document.getElementById("isbnInput").value || "").replace(/[-\\s]/g, "");
  if (!isbn) { alert("Saisis un ISBN (10 ou 13 chiffres)"); return; }
  const hint = document.getElementById("importHint");
  hint.textContent = "Import en cours…";

  try {
    try {
      await importFromGoogleBooksByISBN(isbn); // 1) Google Books
    } catch {
      await importFromOpenLibraryByISBN(isbn); // 2) Fallback OL
    }
    hint.textContent = importedCoverDataURL ? "Métadonnées importées. Couverture trouvée ✅" : "Métadonnées importées (couverture indisponible)";
    // Ouvre directement le formulaire pour enchaîner
    document.getElementById("modal").classList.remove("hidden");
  } catch (e) {
    hint.textContent = "Aucun résultat trouvé. Vérifie l'ISBN.";
  }
});

// =====================================
// Enregistrement d'une nouvelle BD
// =====================================
document.getElementById("saveButton").onclick = async () => {
  const file = document.getElementById("coverInput").files[0];
  let cover = "";

  if (file) {
    cover = await toBase64(file);
  } else if (importedCoverDataURL) {
    cover = importedCoverDataURL;
  }

  const bd = {
    title:  document.getElementById("titleInput").value,
    author: document.getElementById("authorInput").value,
    artist: document.getElementById("artistInput").value,
    editor: document.getElementById("editorInput").value,
    date:   document.getElementById("dateInput").value,
    status: document.getElementById("statusInput").value,
    cover
  };

  const tx = db.transaction("bd", "readwrite");
  tx.objectStore("bd").add(bd);

  tx.oncomplete = () => {
    loadBD();
    resetForm();
    importedCoverDataURL = "";
    document.getElementById("modal").classList.add("hidden");
  };
};

function resetForm() {
  document.getElementById("titleInput").value = "";
  document.getElementById("authorInput").value = "";
  document.getElementById("artistInput").value = "";
  document.getElementById("editorInput").value = "";
  document.getElementById("dateInput").value = "";
  document.getElementById("statusInput").value = "a_lire";
  document.getElementById("coverInput").value = "";
  document.getElementById("isbnInput").value = "";
}

function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}