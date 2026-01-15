function getToken() {
  return localStorage.getItem("token") || "";
}
function setToken(t) {
  localStorage.setItem("token", t);
}
function clearToken() {
  localStorage.removeItem("token");
}
function getUserEmail() {
  return localStorage.getItem("user_email") || "";
}
function setUserEmail(e) {
  localStorage.setItem("user_email", e);
}

import "./style.css";

async function apiGet(path) {
  const token = getToken();
  const r = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function renderLoginPage() {
  setApp(`
    <div class="wrap">
      <h1>Choisir un utilisateur</h1>
      <div id="status" class="muted">Chargement...</div>

      <div class="row" style="gap:12px; align-items:flex-end; flex-wrap:wrap; margin-top:10px;">
        <div>
          <div><b>Email</b></div>
          <select id="userSelect" style="min-width:380px; padding:8px;"></select>
        </div>
        <button id="btnLogin" style="padding:8px 12px;">Se connecter</button>
        <button id="btnLogout" style="padding:8px 12px;">Se déconnecter</button>
      </div>

      <div id="info" style="margin-top:10px;"></div>
    </div>
  `);

  const data = await apiGet("/api/auth/users");
  const items = data.items || [];

  const sel = document.querySelector("#userSelect");
  sel.innerHTML = items.map(u => `<option value="${htmlEscape(u.email)}">${htmlEscape(u.email)}</option>`).join("");

  document.querySelector("#status").textContent =
    `Utilisateurs disponibles: ${items.length}`;

  // affiche l'user courant
  const current = getUserEmail();
  document.querySelector("#info").innerHTML = current
    ? `<b>Connecté en tant que :</b> ${htmlEscape(current)}`
    : `<span class="muted">Pas connecté</span>`;

  document.querySelector("#btnLogin").addEventListener("click", async () => {
    try {
      const email = sel.value;
      const res = await apiPost("/api/auth/login", { email });
      setToken(res.access_token);
      setUserEmail(res.user.email);
      window.location.hash = "#/";
    } catch (e) {
      document.querySelector("#status").textContent = String(e);
    }
  });

  document.querySelector("#btnLogout").addEventListener("click", () => {
    clearToken();
    setUserEmail("");
    document.querySelector("#info").innerHTML = `<span class="muted">Pas connecté</span>`;
  });
}

async function apiPost(path, bodyObj) {
  const token = getToken();
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(bodyObj),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ===========================
// ✅ Edition d'annotation
// ===========================
const ANNOT_STATUS_OPTIONS = ["UNREVIEWED", "OUI", "NON", "DOUTEUX", "DISCARDED"];

function renderAnnotEditor(alignmentId, label, items) {
  const myEmail = (getUserEmail() || "").toLowerCase();
  const my = (items || []).find(x => (x.email || "").toLowerCase() === myEmail);

  const currentStatus = my?.status || "UNREVIEWED";
  const currentComment = my?.comment || "";

  return `
    <div class="annot-box" data-aid="${htmlEscape(alignmentId)}" data-label="${htmlEscape(label)}">
      <div class="annot-head">
        <div class="muted small">
          <b>Mon statut :</b>
          <span class="pill">${htmlEscape(currentStatus)}</span>
          ${my?.created_at ? `<span class="muted small">— ${htmlEscape(my.created_at)}</span>` : ""}
        </div>
        <button class="btn small js-toggle-annot" type="button">Modifier statut d'annotation</button>
      </div>

      <div class="annot-editor" style="display:none; margin-top:10px;">
        <div class="row" style="gap:12px; align-items:flex-end; flex-wrap:wrap;">
          <div>
            <div class="muted small"><b>Status</b></div>
            <select class="js-annot-status" style="min-width:220px; padding:8px;">
              ${ANNOT_STATUS_OPTIONS.map(s => {
                const sel = s === currentStatus ? "selected" : "";
                return `<option value="${s}" ${sel}>${s}</option>`;
              }).join("")}
            </select>
          </div>

          <div style="flex:1; min-width:260px;">
            <div class="muted small"><b>Commentaire</b></div>
            <input class="js-annot-comment" type="text" style="width:100%; padding:8px;"
                   value="${htmlEscape(currentComment)}"
                   placeholder="(optionnel)" />
          </div>

          <button class="btn js-save-annot" type="button">Enregistrer</button>
        </div>

        <div class="js-annot-msg muted small" style="margin-top:8px;"></div>
      </div>
    </div>
  `;
}

function attachAnnotEditors() {
  // Anti double-bind : on marque les boutons déjà bindés
  const markOnce = (el, key) => {
    const k = `__bound_${key}`;
    if (el[k]) return false;
    el[k] = true;
    return true;
  };

  // Toggle open/close
  document.querySelectorAll(".js-toggle-annot").forEach((btn) => {
    if (!markOnce(btn, "toggle")) return;

    btn.addEventListener("click", () => {
      const box = btn.closest(".annot-box");
      if (!box) return;
      const editor = box.querySelector(".annot-editor");
      if (!editor) return;

      editor.style.display = editor.style.display === "none" ? "block" : "none";
    });
  });

  // Save
  document.querySelectorAll(".js-save-annot").forEach((btn) => {
    if (!markOnce(btn, "save")) return;

    btn.addEventListener("click", async () => {
      const box = btn.closest(".annot-box");
      if (!box) return;

      const aid = Number(box.getAttribute("data-aid") || 0);
      const label = box.getAttribute("data-label") || "";
      const status = box.querySelector(".js-annot-status")?.value || "UNREVIEWED";
      const comment = box.querySelector(".js-annot-comment")?.value || "";
      const msg = box.querySelector(".js-annot-msg");

      if (!aid) {
        if (msg) msg.textContent = "Erreur: alignment_id manquant.";
        return;
      }

      if (msg) msg.textContent = "Enregistrement...";
      btn.disabled = true;

      try {
        await apiPost(`/api/alignments/${aid}/annotate`, { status, comment });

        // Refresh latest pour ré-afficher
        const latest = await fetchAlignmentAnnotationsLatest(aid);

        // Rafraîchir le tableau des annotations (bloc ann-block)
        const annBlock = box.closest(".align-body")?.querySelector(".ann-block");
        if (annBlock) {
          annBlock.innerHTML = `
            <div class="ann-title"><b>Annotations (latest par user)</b></div>
            ${renderAnnotationsTable(latest.items || [])}
          `;
        }

        // Remplacer l'éditeur par une version recalculée (mon statut / commentaire)
        box.outerHTML = renderAnnotEditor(aid, label, latest.items || []);

        // Re-bind sur le nouveau DOM
        attachAnnotEditors();
      } catch (e) {
        if (msg) msg.textContent = String(e);
      } finally {
        btn.disabled = false;
      }
    });
  });
}


function htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setApp(html) {
  document.querySelector("#app").innerHTML = html;
}

function getRoute() {
  const h = window.location.hash || "#/";
  const parts = h.replace(/^#\/?/, "").split("/").filter(Boolean);
  return parts;
}

/**
 * Menus prédéfinis (B2)
 * value = ce qu’on envoie au backend (format "a,b,c")
 */
const TRIO_PRESETS = [
  { label: "Tous les trios", value: "" },
  { label: "discarded-discarded-discarded", value: "discarded,discarded,discarded" },
  { label: "unreviewed-unreviewed-unreviewed", value: "unreviewed,unreviewed,unreviewed" },
  { label: "discarded-discarded-unreviewed", value: "discarded,discarded,unreviewed" },
  { label: "oui-non-unreviewed", value: "oui,non,unreviewed" },
  { label: "oui-oui-oui", value: "oui,oui,oui" },
  { label: "non-non-non", value: "non,non,non" },
  { label: "douteux-douteux-douteux", value: "douteux,douteux,douteux" },
  { label: "douteux-non-non", value: "douteux,non,non" },
  { label: "douteux-unreviewed-unreviewed", value: "douteux,unreviewed,unreviewed" },
  { label: "douteux-discarded-discarded", value: "douteux,discarded,discarded" },
];

function getSelectedTrio() {
  const params = new URLSearchParams(window.location.search);
  return params.get("trio") || "";
}

function setSelectedTrio(trioValue) {
  const url = new URL(window.location.href);
  if (!trioValue) url.searchParams.delete("trio");
  else url.searchParams.set("trio", trioValue);
  history.replaceState({}, "", url.toString());
}

async function renderClustersPage() {
  const currentTrio = getSelectedTrio();

  setApp(`
    <div class="wrap">
      <h1>Clusters</h1>

      <!-- 🔐 Bandeau utilisateur -->
      <div class="row" style="justify-content: space-between; margin-bottom: 10px;">
        <div class="muted small">
          Connecté : <b>${htmlEscape(getUserEmail() || "—")}</b>
        </div>
        <div>
          <a href="#/login">Changer d’utilisateur</a>
        </div>
      </div>

      <div class="row">
        <label for="trioSelect"><b>Filtre trio annotation</b></label>
        <select id="trioSelect"></select>
        <span id="status">Chargement...</span>
      </div>

      <div id="table"></div>
    </div>
  `);

  // Remplit le select
  const select = document.querySelector("#trioSelect");
  select.innerHTML = TRIO_PRESETS.map(p => {
    const sel = p.value === currentTrio ? "selected" : "";
    return `<option value="${htmlEscape(p.value)}" ${sel}>${htmlEscape(p.label)}</option>`;
  }).join("");

  // Quand on change : on met l’URL à jour + on recharge la table
  select.addEventListener("change", () => {
    const v = select.value;
    setSelectedTrio(v);
    renderClustersPage();
  });

  // Appel API
  const trio = getSelectedTrio();
  const url = trio
    ? `/api/clusters?limit=200&offset=0&trio=${encodeURIComponent(trio)}`
    : `/api/clusters?limit=200&offset=0`;

  const data = await apiGet(url);
  const items = data.items || [];

  document.querySelector("#status").textContent =
    `lignes: ${items.length} (limit=${data.limit} offset=${data.offset})`;

  const cols = [
    "cluster_id",
    "triangles_count",
    "oldest_alignment_id",
    "ref_triangle_id",
    "trio_sorted",
    "oldest_filename",
    "oldest_text_date",
  ];

  let html = `<table><thead><tr>${cols.map(c => `<th>${htmlEscape(c)}</th>`).join("")}</tr></thead><tbody>`;
  for (const row of items) {
    html += "<tr>";
    for (const c of cols) {
      if (c === "cluster_id") {
        html += `<td><a href="#/cluster/${row.cluster_id}">${htmlEscape(row.cluster_id)}</a></td>`;
      } else {
        html += `<td>${htmlEscape(row[c])}</td>`;
      }
    }
    html += "</tr>";
  }
  html += "</tbody></table>";

  document.querySelector("#table").innerHTML = html;
}


/* =========================================================
   ✅ PAGE 2 (NEW): bandeau résumé en tableau (haut de page)
   ========================================================= */

/**
 * Attendu: endpoint BACKEND à créer (recommandé)
 * GET /api/clusters/{cluster_id}/summary
 * Réponse JSON (exemple):
 * {
 *   "cluster_id": 123,
 *   "unique_alignments_count": 456,
 *   "triangles_count": 22,
 *   "oldest_author_name": "Cicéron",
 *   "oldest_work_title": "De Oratore"
 * }
 *
 * Si l’endpoint n’existe pas encore, la page affichera "—" partout sauf cluster_id.
 */
function renderClusterTopSummaryTable(summary) {
  return `
    <div class="summary-card">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Cluster : <span class="muted">cluster_id</span></th>
            <th>Nbre Alignement unique dedans</th>
            <th>Nbre de triangles</th>
            <th>Auteur plus vieux passage</th>
            <th>Oeuvre plus vieux passage</th>
            
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>${htmlEscape(summary?.cluster_id ?? "—")}</b></td>
            <td>${htmlEscape(summary?.unique_alignments_count ?? "—")}</td>
            <td>${htmlEscape(summary?.triangles_count ?? "—")}</td>
            <td>${htmlEscape(summary?.oldest_author_name ?? "—")}</td>
                      <td>
            <div><b>${htmlEscape(summary?.oldest_work_title ?? "—")}</b></div>
            <div class="muted small">${htmlEscape(summary?.oldest_work_date ?? "—")}</div>
          </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

/**
 * PAGE 2: on affiche seulement le bandeau résumé pour l'instant.
 * (Ensuite, on ajoutera d’autres composants sous le bandeau.)
 */


function renderPassageTable(p, meta, titleLabel) {
  // p = { passage_id, context_before, content, context_after }
  // meta = { authors, work_title, work_date }
  return `
    <div class="passage-card">
      <div class="passage-title">
        <b>${htmlEscape(titleLabel)}</b>
        <span class="muted">passage_id: ${htmlEscape(p?.passage_id ?? "—")}</span>
      </div>

      <table class="passage-table">
        <thead>
          <tr>
            <th>Context_before.passages</th>
            <th>Content.passages</th>
            <th>Context_after.passages</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><pre class="cell-pre">${htmlEscape(p?.context_before ?? "")}</pre></td>
            <td><pre class="cell-pre">${htmlEscape(p?.content ?? "")}</pre></td>
            <td><pre class="cell-pre">${htmlEscape(p?.context_after ?? "")}</pre></td>
          </tr>
        </tbody>
      </table>

      <div class="passage-meta-band">
        <span><b>Auteur:</b> ${htmlEscape(meta?.authors ?? "—")}</span>
        <span><b>Oeuvre:</b> ${htmlEscape(meta?.work_title ?? "—")}</span>
        <span><b>Date:</b> ${htmlEscape(meta?.work_date ?? "—")}</span>
      </div>
    </div>
  `;
}

function renderAlignmentSection(label, a, metaByPassageId, vertexByPassageId, annItems) {
  const src = a?.source || {};
  const tgt = a?.target || {};

  const srcMeta = metaByPassageId.get(src.passage_id) || null;
  const tgtMeta = metaByPassageId.get(tgt.passage_id) || null;

  const srcV = vertexByPassageId.get(src.passage_id) || "A";
  const tgtV = vertexByPassageId.get(tgt.passage_id) || "B";

  const editor = a?.alignment_id
    ? renderAnnotEditor(a.alignment_id, label, annItems || [])
    : "";

  return `
    <details class="align-details" open>
      <summary class="align-summary">
        <span class="summary-title">Détail : Alignment ${htmlEscape(label.toUpperCase())}</span>
        <span class="muted">alignment_id: ${htmlEscape(a?.alignment_id ?? "—")}</span>
      </summary>

      <div class="align-body">
        ${editor}

        <div class="ann-block" style="margin-top:12px;">
          <div class="ann-title"><b>Annotations (latest par user)</b></div>
          ${renderAnnotationsTable(annItems)}
        </div>

        <div class="stack-passages" style="margin-top:12px;">
          ${renderPassageTable(src, srcMeta, `Passage ${srcV}`)}
          ${renderPassageTable(tgt, tgtMeta, `Passage ${tgtV}`)}
        </div>
      </div>
    </details>
  `;
}



async function fetchPassageMeta(passageId) {
  if (!passageId) return null;
  return apiGet(`/api/passages/${passageId}/meta`);
}

async function fetchAlignmentAnnotationsLatest(alignmentId) {
  if (!alignmentId) return { items: [] };
  return apiGet(`/api/alignments/${alignmentId}/annotations/latest`);
}

function renderAnnotationsTable(items) {
  if (!items || items.length === 0) {
    return `<div class="muted small">Aucune annotation.</div>`;
  }

  return `
    <table class="ann-table">
      <thead>
        <tr>
          <th>Utilisateur</th>
          <th>Status</th>
          <th>Commentaire</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(a => `
          <tr>
            <td>${htmlEscape(a.email ?? "")}</td>
            <td><b>${htmlEscape(a.status ?? "")}</b></td>
            <td>${htmlEscape(a.comment ?? "")}</td>
            <td class="muted small">${htmlEscape(a.created_at ?? "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


function buildVertexLabels(head, metaByPassageId) {
  // On va construire une map: passage_id -> "A" | "B" | "C"
  // Règle:
  // A = AB.source, B = AB.target, et on déduit C par text_id.

  const map = new Map();

  const abS = head?.alignments?.ab?.source?.passage_id;
  const abT = head?.alignments?.ab?.target?.passage_id;

  if (!abS || !abT) return map;

  map.set(abS, "A");
  map.set(abT, "B");

  const abS_text = metaByPassageId.get(abS)?.text_id;
  const abT_text = metaByPassageId.get(abT)?.text_id;

  // On récupère tous les passages du head triangle
  const allPids = [
    head?.alignments?.ab?.source?.passage_id,
    head?.alignments?.ab?.target?.passage_id,
    head?.alignments?.ac?.source?.passage_id,
    head?.alignments?.ac?.target?.passage_id,
    head?.alignments?.bc?.source?.passage_id,
    head?.alignments?.bc?.target?.passage_id,
  ].filter(Boolean);

  // C = le passage dont le text_id n'est ni celui de A ni celui de B
  for (const pid of allPids) {
    if (map.has(pid)) continue;
    const tid = metaByPassageId.get(pid)?.text_id;
    if (!tid) continue;

    // si on connaît les text_id de A/B, on déduit C
    if (abS_text != null && abT_text != null && tid !== abS_text && tid !== abT_text) {
      map.set(pid, "C");
    }
  }

  // Si jamais on n'a pas réussi à déduire C (cas bizarre), on laisse vide.
  return map;
}

async function renderClusterDetailPage(clusterId) {
  setApp(`
    <div class="wrap">
      <div style="margin-bottom:12px;">
        <a href="#/">&larr; Retour</a>
      </div>

      <h1>Cluster ${htmlEscape(clusterId)}</h1>

      <!-- 🔐 Bandeau utilisateur -->
      <div class="row" style="justify-content: space-between; margin-bottom: 10px;">
        <div class="muted small">
          Connecté : <b>${htmlEscape(getUserEmail() || "—")}</b>
        </div>
        <div>
          <a href="#/login">Changer d’utilisateur</a>
        </div>
      </div>

      <div id="status">Chargement...</div>
      <div id="topSummary"></div>

      <div id="content"></div>
    </div>
  `);

  // 1) Résumé (tableau du haut)
  let summary = null;
  try {
    summary = await apiGet(`/api/clusters/${clusterId}/summary`);
    document.querySelector("#status").textContent = "Résumé chargé.";
  } catch (e) {
    summary = { cluster_id: clusterId };
    document.querySelector("#status").textContent =
      "Résumé indisponible (endpoint /summary non présent). Affichage partiel.";
  }
  document.querySelector("#topSummary").innerHTML = renderClusterTopSummaryTable(summary);

  // 2) Charger head_triangle
  const head = await apiGet(`/api/clusters/${clusterId}/head_triangle`);

  // 3) Récupérer les 6 passage_id (AB/AC/BC * source/target)
  const ids = [
    head?.alignments?.ab?.source?.passage_id,
    head?.alignments?.ab?.target?.passage_id,
    head?.alignments?.ac?.source?.passage_id,
    head?.alignments?.ac?.target?.passage_id,
    head?.alignments?.bc?.source?.passage_id,
    head?.alignments?.bc?.target?.passage_id,
  ].filter(Boolean);

  const uniqueIds = [...new Set(ids)];

  // 4) Charger les metas passages en parallèle
  const metas = await Promise.all(
    uniqueIds.map(async (pid) => {
      try {
        return await fetchPassageMeta(pid);
      } catch {
        return { passage_id: pid };
      }
    })
  );

  // 5) Index meta par passage_id + labels A/B/C
  const metaByPassageId = new Map(metas.map((m) => [m.passage_id, m]));
  const vertexByPassageId = buildVertexLabels(head, metaByPassageId);

  // 6) Alignements AB / AC / BC
  const ab = head?.alignments?.ab;
  const ac = head?.alignments?.ac;
  const bc = head?.alignments?.bc;

  // 6bis) Charger les annotations (latest par user) pour AB/AC/BC
  const [abAnn, acAnn, bcAnn] = await Promise.all([
    fetchAlignmentAnnotationsLatest(ab?.alignment_id),
    fetchAlignmentAnnotationsLatest(ac?.alignment_id),
    fetchAlignmentAnnotationsLatest(bc?.alignment_id),
  ]);

  // 7) Rendu HTML
  document.querySelector("#content").innerHTML = `
    <h2 class="big-title">Triangle de tête du cluster</h2>

    ${renderAlignmentSection("ab", ab, metaByPassageId, vertexByPassageId, abAnn?.items || [])}
    ${renderAlignmentSection("ac", ac, metaByPassageId, vertexByPassageId, acAnn?.items || [])}
    ${renderAlignmentSection("bc", bc, metaByPassageId, vertexByPassageId, bcAnn?.items || [])}
  `;

  // ✅ 8) Bind des boutons/inputs UNE FOIS que le DOM existe
  attachAnnotEditors();
}



async function router() {
  const parts = getRoute();

  try {
    // 1) Page "login" toujours accessible
    if (parts[0] === "login") {
      await renderLoginPage();
      return;
    }

    // 2) Si pas de token => on nettoie l'état local et on force le login
    if (!getToken()) {
      clearToken();
      setUserEmail(""); // ou localStorage.removeItem("user_email")
      if (window.location.hash !== "#/login") {
        window.location.hash = "#/login";
      }
      return;
    }

    // 3) Page principale : liste des clusters
    if (parts.length === 0) {
      await renderClustersPage();
      return;
    }

    // 4) Page détail d’un cluster
    if (parts[0] === "cluster" && parts[1]) {
      const clusterId = Number(parts[1]);
      if (!Number.isFinite(clusterId)) throw new Error("cluster_id invalide");
      await renderClusterDetailPage(clusterId);
      return;
    }

    // 5) Fallback
    window.location.hash = "#/";
  } catch (e) {
    setApp(`
      <div class="wrap">
        <h1>Erreur</h1>
        <pre>${htmlEscape(e)}</pre>
        <p><a href="#/">Retour</a></p>
      </div>
    `);
  }
}

window.addEventListener("hashchange", router);
router();
