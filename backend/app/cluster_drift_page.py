"""
Router dédié à la page "Réseau sémantique / clusters de drift".

Sert les données de drift lexical (mots cibles + voisins par cluster,
arêtes de similarité) à partir de deux fichiers CSV chargés en mémoire
au premier appel. Ne dépend pas de la base Postgres : ces données sont
un export figé (viz_nodes.csv / viz_edges.csv), distinct des tables
`alignments` / `annotations` utilisées par le reste de l'app.

Placez les fichiers ici :
    backend/app/data/cluster_drift/viz_nodes.csv
    backend/app/data/cluster_drift/viz_edges.csv
"""

import csv
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/cluster-drift", tags=["cluster-drift"])

DATA_DIR = Path(__file__).resolve().parent / "data" / "cluster_drift"
NODES_PATH = DATA_DIR / "viz_nodes.csv"
EDGES_PATH = DATA_DIR / "viz_edges.csv"

# ─── état en mémoire, chargé une seule fois (lazy) ─────────────────────────
_nodes_by_cluster: dict[int, list[dict]] = {}
_edges_by_cluster: dict[int, list[dict]] = {}
_word_to_cluster: dict[str, int] = {}
_cluster_word_count: dict[int, int] = {}
_loaded = False


def _to_bool(v) -> bool:
    return str(v).strip().lower() == "true"


def _load_data() -> None:
    global _loaded
    if _loaded:
        return

    if not NODES_PATH.exists() or not EDGES_PATH.exists():
        raise RuntimeError(
            f"Fichiers de données cluster-drift introuvables. "
            f"Attendus : {NODES_PATH} et {EDGES_PATH}"
        )

    with open(NODES_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cid = int(row["cluster_id"])
            _nodes_by_cluster.setdefault(cid, []).append(row)
            if _to_bool(row.get("is_target", "")):
                word = row["word"]
                _word_to_cluster[word] = cid
                _cluster_word_count[cid] = _cluster_word_count.get(cid, 0) + 1

    with open(EDGES_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cid = int(row["cluster_id"])
            _edges_by_cluster.setdefault(cid, []).append(row)

    _loaded = True


def _serialize_node(row: dict) -> dict:
    drift_raw = row.get("drift_value")
    return {
        "word": row["word"],
        "is_target": _to_bool(row.get("is_target", "")),
        "drift_value": float(drift_raw) if drift_raw not in (None, "") else None,
        "categorie": row.get("categorie") or "",
        "degree": int(row["degree"]) if row.get("degree") not in (None, "") else 0,
    }


def _serialize_edge(row: dict) -> dict:
    return {
        "source": row["source"],
        "target": row["target"],
        "weight": float(row["weight"]),
    }


@router.get("/stats")
def drift_stats():
    """Compteurs globaux, pour l'en-tête de la page."""
    try:
        _load_data()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {
        "target_words_count": len(_word_to_cluster),
        "clusters_count": len(_cluster_word_count),
    }


@router.get("/words")
def list_target_words(
    q: Optional[str] = Query(None, description="Filtre insensible à la casse (sous-chaîne)"),
    limit: int = Query(5000, ge=1, le=10000),
):
    """
    Liste des mots cibles (payload léger : ~3 500 mots), avec leur
    cluster_id et la taille du cluster. Le front peut la charger une
    seule fois et filtrer côté client au fil de la frappe, ou passer
    `q` pour un filtrage serveur.
    """
    try:
        _load_data()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    words = sorted(_word_to_cluster.keys(), key=lambda w: w.lower())
    if q:
        ql = q.lower()
        words = [w for w in words if ql in w.lower()]

    total = len(words)
    items = [
        {
            "word": w,
            "cluster_id": _word_to_cluster[w],
            "cluster_word_count": _cluster_word_count[_word_to_cluster[w]],
        }
        for w in words[:limit]
    ]
    return {"total": total, "returned": len(items), "items": items}


@router.get("/clusters/{cluster_id}")
def cluster_graph(cluster_id: int):
    """Nœuds + arêtes d'UN cluster (le seul appel coûteux, déclenché au clic sur un mot)."""
    try:
        _load_data()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    nodes = _nodes_by_cluster.get(cluster_id)
    if nodes is None:
        raise HTTPException(status_code=404, detail="cluster_id introuvable")

    edges = _edges_by_cluster.get(cluster_id, [])

    return {
        "cluster_id": cluster_id,
        "nodes": [_serialize_node(n) for n in nodes],
        "edges": [_serialize_edge(e) for e in edges],
    }
