// ─── cluster_drift_page.js ──────────────────────────────────────────────────
// Page "Réseau sémantique / clusters de drift".
// Consomme l'API dédiée backend/app/cluster_drift_page.py (préfixe
// /api/cluster-drift/...) — même convention que les autres pages du site
// (apiGet local, gestion 401, etc.), au lieu de charger des CSV bruts.

const API_BASE = "/api/cluster-drift";

const D3_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js";

// ─── helpers HTTP (mêmes conventions que alignments_page.js) ──────────────

function getToken() {
  return localStorage.getItem("token") || "";
}

async function apiGet(path) {
  const r = await fetch(path, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });

  if (r.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user_email");
    localStorage.removeItem("visitor_mode");
    window.location.hash = "#/login";
    throw new Error("Session expirée, veuillez vous reconnecter.");
  }

  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

function htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ─── chargement paresseux de D3 (au cas où il ne serait pas déjà chargé) ──

let _d3LoadPromise = null;
function ensureD3() {
  if (window.d3) return Promise.resolve(window.d3);
  if (_d3LoadPromise) return _d3LoadPromise;
  _d3LoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = D3_CDN_URL;
    script.onload = () => resolve(window.d3);
    script.onerror = () => reject(new Error("Impossible de charger D3 depuis le CDN."));
    document.head.appendChild(script);
  });
  return _d3LoadPromise;
}

// ─── styles scopés (injectés une seule fois) ───────────────────────────────

const STYLE_ID = "cluster-drift-styles";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cluster-drift-page{
      --cd-ink-950:#1b1912;
      --cd-ink-900:#242017;
      --cd-ink-800:#332c1f;
      --cd-parchment:#e9e2d0;
      --cd-parchment-dim:#a89f8a;
      --cd-gold:#c9a24b;
      --cd-gold-dim:#8a7538;
      --cd-rule:#4a4331;
      --cd-stable:#5c8a72;
      --cd-modere:#c9a24b;
      --cd-fort:#b1543f;
      --cd-neutre:#6b6355;
      --cd-font-display:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;
      --cd-font-mono:'IBM Plex Mono','SFMono-Regular',Consolas,monospace;
    }
    .cluster-drift-page{ font-family:var(--cd-font-mono); }
    .cluster-drift-page .cd-topbar{
      display:flex; align-items:center; justify-content:space-between;
      margin-bottom:10px; gap:12px; flex-wrap:wrap;
    }
    .cluster-drift-page .cd-topbar h1{
      font-family:var(--cd-font-display); font-weight:400; font-size:20px;
      margin:0; color:#1a1a1a;
    }
    .cluster-drift-page .cd-topbar h1 .cd-cluster-tag{ color:var(--cd-gold-dim); font-style:italic; }
    .cluster-drift-page .cd-sub{ font-size:12px; color:#777; }

    #cdStage{
      position:relative; width:100%;
      height:min(78vh, 760px); min-height:480px;
      background:var(--cd-ink-950); color:var(--cd-parchment);
      border-radius:8px; overflow:hidden;
      box-shadow:0 1px 4px rgba(0,0,0,0.15);
    }
    #cdStage svg{ width:100%; height:100%; display:block; cursor:grab; }
    #cdStage svg:active{ cursor:grabbing; }

    #cdStage .link{ stroke:var(--cd-rule); fill:none; }
    #cdStage .link.hi{ stroke:var(--cd-gold); }
    #cdStage .node circle{ stroke:var(--cd-ink-950); stroke-width:1.4px; cursor:pointer; }
    #cdStage .node circle.target-ring{ stroke:var(--cd-gold); stroke-width:2.5px; }
    #cdStage .node text{
      font-family:var(--cd-font-display); font-style:italic; font-size:10px;
      fill:var(--cd-parchment-dim); pointer-events:none; paint-order:stroke;
      stroke:var(--cd-ink-950); stroke-width:3px; stroke-linejoin:round;
    }
    #cdStage .node.dim{ opacity:.12; }
    #cdStage .link.dim{ opacity:.05; }

    #cdTooltip{
      position:absolute; z-index:30; pointer-events:none;
      background:var(--cd-ink-900); border:1px solid var(--cd-gold-dim); padding:10px 13px;
      font-size:11.5px; line-height:1.65; min-width:170px; opacity:0; transition:opacity .1s;
      box-shadow:0 6px 18px rgba(0,0,0,.4); color:var(--cd-parchment);
    }
    #cdTooltip .tt-word{ font-family:var(--cd-font-display); font-style:italic; font-size:14px;
      color:var(--cd-gold); display:block; margin-bottom:5px; }
    #cdTooltip .tt-row{ display:flex; justify-content:space-between; gap:16px; color:var(--cd-parchment-dim); }
    #cdTooltip .tt-row b{ color:var(--cd-parchment); font-weight:400; }

    #cdWordPanel{
      position:absolute; top:14px; left:14px; z-index:15; width:220px;
      display:flex; flex-direction:column; background:var(--cd-ink-900);
      border:1px solid var(--cd-rule); max-height:calc(100% - 28px);
    }
    #cdWordSearchWrap{ padding:10px; border-bottom:1px solid var(--cd-rule); }
    #cdWordSearchLabel{ font-size:10px; color:var(--cd-parchment-dim); letter-spacing:.05em;
      text-transform:uppercase; margin-bottom:6px; display:block; }
    #cdWordSearch{
      width:100%; background:var(--cd-ink-950); border:1px solid var(--cd-rule); color:var(--cd-parchment);
      font-family:var(--cd-font-mono); font-size:12.5px; padding:7px 9px; outline:none; box-sizing:border-box;
    }
    #cdWordSearch:focus{ border-color:var(--cd-gold-dim); }
    #cdWordList{ overflow-y:auto; }
    .cd-word-item{
      padding:7px 12px; font-size:12px; color:var(--cd-parchment-dim); cursor:pointer;
      border-bottom:1px solid rgba(74,67,49,.4);
      display:flex; justify-content:space-between; align-items:center; gap:8px;
    }
    .cd-word-item:hover{ background:var(--cd-ink-800); color:var(--cd-parchment); }
    .cd-word-item.active{ background:var(--cd-gold); color:var(--cd-ink-950); font-weight:600; }
    .cd-word-item .cnt{ font-size:10px; opacity:.6; }
    .cd-word-item-empty{ padding:12px; font-size:11.5px; color:var(--cd-parchment-dim); font-style:italic; }

    #cdPanel{ position:absolute; top:14px; right:14px; z-index:15; display:flex; gap:8px; }
    #cdReset, #cdFullscreen{
      background:transparent; border:1px solid var(--cd-rule); color:var(--cd-parchment-dim);
      font-family:var(--cd-font-mono); font-size:10.5px; letter-spacing:.04em; text-transform:uppercase;
      padding:6px 11px; cursor:pointer; border-radius:3px; white-space:nowrap;
    }
    #cdReset:hover, #cdFullscreen:hover{ border-color:var(--cd-gold-dim); color:var(--cd-gold); }

    /* En plein écran natif, le stage doit occuper tout l'écran (pas juste 78vh) */
    #cdStage:fullscreen{ width:100vw; height:100vh; }
    #cdStage:-webkit-full-screen{ width:100vw; height:100vh; }

    #cdLegend{
      position:absolute; bottom:14px; left:14px; z-index:10;
      display:flex; gap:14px; flex-wrap:wrap; font-size:10.5px; color:var(--cd-parchment-dim);
      background:rgba(27,25,18,.75); padding:8px 12px; border:1px solid var(--cd-rule); border-radius:3px;
      max-width:calc(100% - 28px);
    }
    #cdLegend .item{ display:flex; align-items:center; gap:6px; }
    #cdLegend .dot{ width:8px; height:8px; border-radius:50%; display:inline-block; }
    #cdLegend .ring{ width:8px; height:8px; border-radius:50%; display:inline-block;
      border:1.5px solid var(--cd-gold); background:transparent; }

    #cdStats{
      position:absolute; bottom:14px; right:14px; z-index:10; font-size:10.5px; color:var(--cd-parchment-dim);
      background:rgba(27,25,18,.75); padding:8px 12px; border:1px solid var(--cd-rule); border-radius:3px; text-align:right;
    }
    #cdStats b{ color:var(--cd-gold); }

    #cdEmptyState, #cdLoadingState, #cdErrorState, #cdClusterLoading{
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      color:var(--cd-parchment-dim); font-family:var(--cd-font-display); font-style:italic; font-size:15px;
      text-align:center; padding:0 40px; pointer-events:none;
    }
    #cdErrorState{ color:var(--cd-fort); flex-direction:column; gap:14px; pointer-events:auto; }
    #cdErrorState button{
      font-family:var(--cd-font-mono); font-style:normal; font-size:12px; padding:8px 16px;
      background:var(--cd-gold); color:var(--cd-ink-950); border:none; cursor:pointer; border-radius:3px;
    }
    .cd-hidden{ display:none !important; }
  `;
  document.head.appendChild(style);
}

// ─── état du module (ré-initialisé à chaque montage de la page) ───────────

function makeState() {
  return {
    wordItems: [],              // [{word, cluster_id, cluster_word_count}, ...]
    currentClusterId: null,
    simulation: null,
  };
}

function renderWordList(state, root, query) {
  const wordListEl = root.querySelector("#cdWordList");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? state.wordItems.filter((it) => it.word.toLowerCase().includes(q))
    : state.wordItems;

  wordListEl.innerHTML = "";
  if (filtered.length === 0) {
    wordListEl.innerHTML = '<div class="cd-word-item-empty">Aucun mot trouvé</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.slice(0, 300).forEach((it) => {
    const div = document.createElement("div");
    div.className = "cd-word-item" + (it.cluster_id === state.currentClusterId ? " active" : "");
    div.innerHTML = `<span>${htmlEscape(it.word)}</span><span class="cnt">${it.cluster_word_count}</span>`;
    div.addEventListener("click", () => selectWord(state, root, it));
    frag.appendChild(div);
  });
  wordListEl.appendChild(frag);

  if (filtered.length > 300) {
    const more = document.createElement("div");
    more.className = "cd-word-item-empty";
    more.textContent = `… ${filtered.length - 300} résultats supplémentaires, affinez la recherche`;
    wordListEl.appendChild(more);
  }
}

async function selectWord(state, root, wordItem) {
  await showCluster(state, root, wordItem.cluster_id);
  renderWordList(state, root, root.querySelector("#cdWordSearch").value);
}

async function showCluster(state, root, clusterId) {
  const clusterLoadingEl = root.querySelector("#cdClusterLoading");
  const emptyEl = root.querySelector("#cdEmptyState");
  emptyEl.classList.add("cd-hidden");
  clusterLoadingEl.classList.remove("cd-hidden");

  try {
    const data = await apiGet(`${API_BASE}/clusters/${clusterId}`);
    state.currentClusterId = clusterId;

    root.querySelector("#cdClusterLabel").textContent = `cluster ${clusterId}`;
    root.querySelector("#cdMetaLabel").textContent =
      `${data.nodes.length} mots affichés · ${data.edges.length} arêtes`;

    clusterLoadingEl.classList.add("cd-hidden");
    renderGraph(state, root, data.nodes, data.edges);
  } catch (err) {
    clusterLoadingEl.classList.add("cd-hidden");
    emptyEl.classList.remove("cd-hidden");
    emptyEl.textContent = `Impossible de charger le cluster ${clusterId} (${String(err.message || err)}).`;
    console.error("cluster_drift: échec du chargement du cluster", err);
  }
}

function renderGraph(state, root, nodes, links) {
  const d3 = window.d3;
  if (state.simulation) state.simulation.stop();

  const stage = root.querySelector("#cdStage");
  const svg = d3.select(stage).select("svg");
  svg.selectAll("*").remove();

  // Copies mutables : d3-force enrichit chaque objet avec x/y/vx/vy,
  // et remplace source/target par des références d'objets.
  nodes = nodes.map((n) => ({ ...n, id: n.word }));
  links = links.map((l) => ({ ...l }));

  const width = stage.clientWidth || 800;
  const height = stage.clientHeight || 600;
  svg.attr("viewBox", [0, 0, width, height]);

  const g = svg.append("g");

  const zoom = d3.zoom()
    .scaleExtent([0.1, 8])
    .on("zoom", (event) => g.attr("transform", event.transform));
  svg.call(zoom);

  root.querySelector("#cdReset").onclick = () => {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  };

  const rootStyle = getComputedStyle(stage);
  const cssVar = (name) => rootStyle.getPropertyValue(name).trim();
  const driftColor = (d) => {
    if (!d.is_target) return cssVar("--cd-neutre");
    if (d.categorie === "stable") return cssVar("--cd-stable");
    if (d.categorie === "modéré") return cssVar("--cd-modere");
    if (d.categorie === "fort") return cssVar("--cd-fort");
    return "#8a8272";
  };

  const rScale = d3.scaleSqrt()
    .domain([0, d3.max(nodes, (n) => n.degree) || 1])
    .range([5, 24]);
  function radius(d) { return rScale(d.degree); }

  state.simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id)
      .distance((l) => 60 + (1 - l.weight) * 140).strength((l) => l.weight * 0.7))
    .force("charge", d3.forceManyBody().strength(-120))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius((d) => radius(d) + 3));

  const link = g.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "link")
    .attr("stroke-width", (l) => 0.6 + l.weight * 2.4)
    .attr("opacity", (l) => 0.15 + l.weight * 0.4);

  const node = g.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", "node")
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));

  node.append("circle")
    .attr("r", radius)
    .attr("fill", driftColor)
    .attr("class", (d) => (d.is_target ? "target-ring" : null));

  node.append("text")
    .attr("dy", (d) => radius(d) + 11)
    .attr("text-anchor", "middle")
    .text((d) => d.id);

  const tooltip = d3.select(root.querySelector("#cdTooltip"));
  const stageRect = () => stage.getBoundingClientRect();

  node.on("mouseenter", (event, d) => {
    const connected = new Set([d.id]);
    links.forEach((l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === d.id) connected.add(t);
      if (t === d.id) connected.add(s);
    });
    node.classed("dim", (n) => !connected.has(n.id));
    link.classed("dim", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return s !== d.id && t !== d.id;
    });
    link.classed("hi", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return s === d.id || t === d.id;
    });

    tooltip.style("opacity", 1).html(`
      <span class="tt-word">${htmlEscape(d.id)}</span>
      <div class="tt-row"><span>statut</span><b>${d.is_target ? "mot cible" : "voisin"}</b></div>
      <div class="tt-row"><span>degré (affiché)</span><b>${d.degree}</b></div>
      ${d.drift_value !== null && d.drift_value !== undefined ? `<div class="tt-row"><span>drift</span><b>${d.drift_value.toFixed(4)}</b></div>` : ""}
      ${d.categorie ? `<div class="tt-row"><span>catégorie</span><b>${htmlEscape(d.categorie)}</b></div>` : ""}
    `);
  }).on("mousemove", (event) => {
    const r = stageRect();
    tooltip.style("left", (event.clientX - r.left + 16) + "px")
           .style("top", (event.clientY - r.top + 12) + "px");
  }).on("mouseleave", () => {
    node.classed("dim", false);
    link.classed("dim", false).classed("hi", false);
    tooltip.style("opacity", 0);
  });

  link.on("mouseenter", (event, l) => {
    tooltip.style("opacity", 1).html(`
      <span class="tt-word">${htmlEscape(l.source.id)} — ${htmlEscape(l.target.id)}</span>
      <div class="tt-row"><span>similarité</span><b>${l.weight.toFixed(4)}</b></div>
    `);
  }).on("mousemove", (event) => {
    const r = stageRect();
    tooltip.style("left", (event.clientX - r.left + 16) + "px")
           .style("top", (event.clientY - r.top + 12) + "px");
  }).on("mouseleave", () => tooltip.style("opacity", 0));

  state.simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  function dragstarted(event, d) {
    if (!event.active) state.simulation.alphaTarget(0.25).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
  function dragended(event, d) {
    if (!event.active) state.simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }
}

function renderLegend(root) {
  const legend = root.querySelector("#cdLegend");
  legend.innerHTML = `
    <span class="item"><span class="ring"></span>mot cible (bordure or)</span>
    <span class="item"><span class="dot" style="background:var(--cd-stable)"></span>stable</span>
    <span class="item"><span class="dot" style="background:var(--cd-modere)"></span>modéré</span>
    <span class="item"><span class="dot" style="background:var(--cd-fort)"></span>fort</span>
    <span class="item"><span class="dot" style="background:var(--cd-neutre)"></span>voisin (non cible)</span>
  `;
}

// ─── point d'entrée de la page ─────────────────────────────────────────────

export async function renderClusterDriftPage(app) {
  injectStyles();
  const state = makeState();

  app.innerHTML = `
    <div class="wrap cluster-drift-page">
      <div style="margin-bottom:12px;">
        <a href="#/">← Retour</a>
      </div>
      <div class="cd-topbar">
        <h1>Réseau sémantique — <span class="cd-cluster-tag" id="cdClusterLabel">aucun cluster sélectionné</span></h1>
        <span class="cd-sub" id="cdMetaLabel"></span>
      </div>

      <div id="cdStage">
        <svg id="cdCanvas"></svg>
        <div id="cdTooltip"></div>

        <div id="cdWordPanel">
          <div id="cdWordSearchWrap">
            <span id="cdWordSearchLabel">Mot cible (cluster ≥ 3 mots)</span>
            <input id="cdWordSearch" type="text" placeholder="rechercher…" autocomplete="off">
          </div>
          <div id="cdWordList"></div>
        </div>

        <div id="cdPanel">
          <button id="cdFullscreen" type="button">⛶ Plein écran</button>
          <button id="cdReset" type="button">Réinitialiser la vue</button>
        </div>

        <div id="cdLegend"></div>
        <div id="cdStats"></div>

        <div id="cdEmptyState">Choisissez un mot dans la liste à gauche<br>pour afficher son cluster.</div>
        <div id="cdClusterLoading" class="cd-hidden">Chargement du cluster…</div>
        <div id="cdLoadingState">Chargement des données de drift…</div>
        <div id="cdErrorState" class="cd-hidden"></div>
      </div>
    </div>
  `;

  const root = app;
  const loadingEl = root.querySelector("#cdLoadingState");
  const errorEl = root.querySelector("#cdErrorState");
  const emptyEl = root.querySelector("#cdEmptyState");
  emptyEl.classList.add("cd-hidden");

  // ─── plein écran ─────────────────────────────────────────────────────
  const stageEl = root.querySelector("#cdStage");
  const fsBtn = root.querySelector("#cdFullscreen");

  fsBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      (stageEl.requestFullscreen || stageEl.webkitRequestFullscreen)?.call(stageEl);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.body.contains(stageEl)) return; // page quittée entre-temps
    const isFs = document.fullscreenElement === stageEl;
    fsBtn.textContent = isFs ? "⤢ Quitter le plein écran" : "⛶ Plein écran";
    // Les dimensions du stage ont changé : redessiner le graphe s'il y en a un.
    if (state.currentClusterId !== null) {
      showCluster(state, root, state.currentClusterId);
    }
  });

  async function loadAndInit() {
    loadingEl.classList.remove("cd-hidden");
    errorEl.classList.add("cd-hidden");
    emptyEl.classList.add("cd-hidden");

    try {
      await ensureD3();

      const [stats, wordsRes] = await Promise.all([
        apiGet(`${API_BASE}/stats`),
        apiGet(`${API_BASE}/words`),
      ]);

      state.wordItems = wordsRes.items;

      root.querySelector("#cdStats").innerHTML =
        `<b>${stats.target_words_count}</b> mots cibles &nbsp;·&nbsp; <b>${stats.clusters_count}</b> clusters`;
      renderLegend(root);

      loadingEl.classList.add("cd-hidden");
      emptyEl.classList.remove("cd-hidden");
      renderWordList(state, root, "");

      root.querySelector("#cdWordSearch").addEventListener("input", (e) => {
        renderWordList(state, root, e.target.value);
      });

      window.addEventListener("resize", () => {
        if (state.currentClusterId !== null) {
          showCluster(state, root, state.currentClusterId);
        }
      });
    } catch (err) {
      if (String(err.message || err).includes("Session expirée")) return;
      console.error("cluster_drift: échec du chargement initial", err);
      loadingEl.classList.add("cd-hidden");
      errorEl.classList.remove("cd-hidden");
      errorEl.innerHTML = `
        Impossible de charger les données de drift (${htmlEscape(String(err.message || err))}).<br>
        Vérifiez que le backend répond bien sur ${API_BASE}/stats.
        <button type="button" id="cdRetryBtn">Réessayer</button>
      `;
      root.querySelector("#cdRetryBtn")?.addEventListener("click", loadAndInit);
    }
  }

  await loadAndInit();
}
