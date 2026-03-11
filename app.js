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
   Toast de confirmation
========================================================= */
function showToast(message, type = "success") {
    const root = document.getElementById("toastRoot") || document.body;

    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `
        <span>${type === "success" ? "✔" : "⚠️"}</span>
        <span>${message}</span>
    `;

    root.appendChild(el);

    el.offsetHeight; 
    el.classList.add("show");

    setTimeout(() => el.remove(), 2600);
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

        // Tri
        items.sort((a, b) =>
            (a.title ?? "").localeCompare(b.title ?? "", "fr", { sensitivity: "base" })
        );

        // Reset UI
        listEl.innerHTML = "";
        listEl.classList.toggle("grid-mode", listMode === "grid");
        listEl.classList.toggle("list-mode", listMode === "list");

        items.forEach((bd) => {
            const wrap = document.createElement("div");
            wrap.dataset.bdId = bd.id; // identifiant pour highlight

            const coverHtml = bd.cover
                ? `<img src="${escapeHTML(bd.cover)}" alt="Couverture" class="bd-cover-img">`
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
                const year = (bd.date ?? "").slice(0, 4);
                const editorYear =
                    bd.editor && year ? `${escapeHTML(bd.editor)} • ${escapeHTML(year)}`
                    : bd.editor ? escapeHTML(bd.editor)
                    : year ? escapeHTML(year)
                    : "";

                wrap.innerHTML = `
                    ${coverHtml}
                    <div class="info">
                        <div class="bd-card-title">${escapeHTML(bd.title)}</div>
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

            // Plus de modale détail → aucun clic par défaut
            wrap.onclick = null;

            listEl.appendChild(wrap);
        });
    };
}

/* =========================================================
   Toggle Grille / Liste
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
    ========================================================== */
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
            byId("synopsisInput").value = bd.synopsis ?? "";
            importedCoverDataURL = bd.cover ?? "";

            modalEl.dataset.editId = id;
            openModal();
        };
    };

    /* =========================================================
       Modale ajout/édition
    ========================================================== */
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
       Enregistrer BD
    ========================================================== */
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

            // Highlight de la nouvelle BD
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
       Reset Formulaire
    ========================================================== */
    function resetForm() {
        ["titleInput", "authorInput", "artistInput", "editorInput", "dateInput", "synopsisInput"]
            .forEach(id => {
                const el = byId(id);
                if (el) el.value = "";
            });

        byId("statusInput").value = "a_lire";
        byId("coverInput").value = "";
        importedCoverDataURL = "";
    }

    /* =========================================================
       Filtres
    ========================================================== */
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
``