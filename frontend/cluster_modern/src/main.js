import "./style.css";

async function apiGet(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
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

function renderAlignmentSection(label, a, metaByPassageId, vertexByPassageId) {
  const src = a?.source || {};
  const tgt = a?.target || {};

  const srcMeta = metaByPassageId.get(src.passage_id) || null;
  const tgtMeta = metaByPassageId.get(tgt.passage_id) || null;

  const srcV = vertexByPassageId.get(src.passage_id) || "Source";
  const tgtV = vertexByPassageId.get(tgt.passage_id) || "Target";

  return `
    <details class="align-details" open>
      <summary class="align-summary">
        <span class="summary-title">Détail : Alignment ${htmlEscape(label.toUpperCase())}</span>
        <span class="muted">alignment_id: ${htmlEscape(a?.alignment_id ?? "—")}</span>
      </summary>

      <div class="align-body">
        <div class="stack-passages">
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

  // ✅ 2) Charger head_triangle
  const head = await apiGet(`/api/clusters/${clusterId}/head_triangle`);

  // ✅ 3) Récupérer les 6 passage_id (AB/AC/BC * source/target)
  const ids = [
    head?.alignments?.ab?.source?.passage_id,
    head?.alignments?.ab?.target?.passage_id,
    head?.alignments?.ac?.source?.passage_id,
    head?.alignments?.ac?.target?.passage_id,
    head?.alignments?.bc?.source?.passage_id,
    head?.alignments?.bc?.target?.passage_id,
  ].filter(Boolean);

  // enlever doublons (au cas où)
  const uniqueIds = [...new Set(ids)];

  // ✅ 4) Charger les metas en parallèle
  const metas = await Promise.all(
    uniqueIds.map(async (pid) => {
      try {
        return await fetchPassageMeta(pid);
      } catch {
        return { passage_id: pid }; // fallback si /meta échoue
      }
    })
  );

  // ✅ 5) Index par passage_id
  const metaByPassageId = new Map(metas.map(m => [m.passage_id, m]));
  const vertexByPassageId = buildVertexLabels(head, metaByPassageId);


  // ✅ 6) Render du bloc “Triangle de tête du cluster”
  const ab = head?.alignments?.ab;
  const ac = head?.alignments?.ac;
  const bc = head?.alignments?.bc;

  document.querySelector("#content").innerHTML = `
    <h2 class="big-title">Triangle de tête du cluster</h2>
    ${renderAlignmentSection("ab", ab, metaByPassageId, vertexByPassageId)}
    ${renderAlignmentSection("ac", ac, metaByPassageId, vertexByPassageId)}
    ${renderAlignmentSection("bc", bc, metaByPassageId, vertexByPassageId)}
  `;
}

async function router() {
  const parts = getRoute();

  try {
    if (parts.length === 0) {
      await renderClustersPage();
      return;
    }

    if (parts[0] === "cluster" && parts[1]) {
      const clusterId = Number(parts[1]);
      if (!Number.isFinite(clusterId)) throw new Error("cluster_id invalide");
      await renderClusterDetailPage(clusterId);
      return;
    }

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
