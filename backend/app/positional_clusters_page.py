from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .db import get_db
from .auth import get_current_user_dep

router = APIRouter(prefix="/positional-clusters", tags=["positional-clusters"])

ALLOWED_ANNOT_STATUSES = {"OUI", "NON", "UNREVIEWED", "DISCARDED", "DOUTEUX"}
ALLOWED_FILTER_LABELS  = {"a_annoter", "conflit", "autre"}
ALLOWED_MODES          = {"strict", "loose"}

PAGE_SIZE_LIST   = 50
PAGE_SIZE_DETAIL = 50

# Tranches de taille de passage de tête (head_end_byte - head_start_byte)
HEAD_SIZE_TRANCHES = {
    "lt1000":      (None, 1000),
    "1000_5000":   (1000, 5000),
    "5000_10000":  (5000, 10000),
    "gt10000":     (10000, None),
}


class PositionalAnnotationIn(BaseModel):
    status: str
    comment: Optional[str] = None


class PositionalPropagateIn(BaseModel):
    status: str
    comment: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _recompute_cluster_meta(db: Session, cluster_id: int):
    """
    1) Met à jour annotation_status/comment dans positional_cluster_alignments
    2) Recalcule annotation_composition et filter_label_* dans positional_clusters
    """

    # 1) Update annotation_status dans positional_cluster_alignments
    db.execute(text("""
        UPDATE positional_cluster_alignments pca
        SET
            annotation_status  = sub.status,
            annotation_comment = sub.comment
        FROM (
            SELECT DISTINCT ON (ann.alignment_id)
                ann.alignment_id,
                ann.status,
                ann.comment
            FROM annotations ann
            WHERE ann.alignment_id IN (
                SELECT alignment_id
                FROM positional_cluster_alignments
                WHERE cluster_id = :cid
            )
            ORDER BY ann.alignment_id, ann.created_at DESC, ann.annotation_id DESC
        ) sub
        WHERE pca.alignment_id = sub.alignment_id
          AND pca.cluster_id   = :cid
    """), {"cid": cluster_id})

    # 2) Recalcul annotation_composition (simple string_agg)
    comp_row = db.execute(text("""
        SELECT '{' || string_agg(DISTINCT COALESCE(annotation_status, 'UNREVIEWED'), ', ' ORDER BY COALESCE(annotation_status, 'UNREVIEWED')) || '}' AS composition
        FROM positional_cluster_alignments
        WHERE cluster_id = :cid
    """), {"cid": cluster_id}).mappings().first()
    composition = comp_row["composition"] if comp_row else None

    # 3) Recalcul filter_label_strict
    strict_row = db.execute(text("""
        SELECT
            CASE
                WHEN bool_and(COALESCE(annotation_status, 'UNREVIEWED') = 'UNREVIEWED'
                              OR COALESCE(annotation_status, 'UNREVIEWED') = 'NON'
                              OR COALESCE(annotation_status, 'UNREVIEWED') = 'DISCARDED')
                 AND NOT bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'OUI')
                 AND bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'UNREVIEWED')
                    THEN 'a_annoter'
                WHEN bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'OUI')
                 AND bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'NON')
                    THEN 'conflit'
                ELSE 'autre'
            END AS filter_label
        FROM positional_cluster_alignments
        WHERE cluster_id = :cid AND mode = 'strict'
    """), {"cid": cluster_id}).mappings().first()
    filter_strict = strict_row["filter_label"] if strict_row else "autre"

    # 4) Recalcul filter_label_loose
    loose_row = db.execute(text("""
        SELECT
            CASE
                WHEN bool_and(COALESCE(annotation_status, 'UNREVIEWED') = 'UNREVIEWED'
                              OR COALESCE(annotation_status, 'UNREVIEWED') = 'NON'
                              OR COALESCE(annotation_status, 'UNREVIEWED') = 'DISCARDED')
                 AND NOT bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'OUI')
                 AND bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'UNREVIEWED')
                    THEN 'a_annoter'
                WHEN bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'OUI')
                 AND bool_or(COALESCE(annotation_status, 'UNREVIEWED') = 'NON')
                    THEN 'conflit'
                ELSE 'autre'
            END AS filter_label
        FROM positional_cluster_alignments
        WHERE cluster_id = :cid AND mode = 'loose'
    """), {"cid": cluster_id}).mappings().first()
    filter_loose = loose_row["filter_label"] if loose_row else "autre"

    # 5) Update positional_clusters
    db.execute(text("""
        UPDATE positional_clusters
        SET
            annotation_composition = :composition,
            filter_label_strict    = :filter_strict,
            filter_label_loose     = :filter_loose
        WHERE cluster_id = :cid
    """), {
        "cid":           cluster_id,
        "composition":   composition,
        "filter_strict": filter_strict,
        "filter_loose":  filter_loose,
    })


# ---------------------------------------------------------------------------
# Liste des clusters positionnels (paginée)
# ---------------------------------------------------------------------------

@router.get("")
def list_positional_clusters(
    limit: int = Query(PAGE_SIZE_LIST, ge=1, le=500),
    offset: int = Query(0, ge=0),
    filter_label_strict: Optional[str] = Query(None),
    filter_label_loose:  Optional[str] = Query(None),
    annotation_composition: Optional[str] = Query(None),
    head_size_tranche: Optional[str] = Query(None, description="lt1000 | 1000_5000 | 5000_10000 | gt10000"),
    db: Session = Depends(get_db),
):
    if filter_label_strict and filter_label_strict not in ALLOWED_FILTER_LABELS:
        raise HTTPException(status_code=400, detail="filter_label_strict invalide.")
    if filter_label_loose and filter_label_loose not in ALLOWED_FILTER_LABELS:
        raise HTTPException(status_code=400, detail="filter_label_loose invalide.")
    if head_size_tranche and head_size_tranche not in HEAD_SIZE_TRANCHES:
        raise HTTPException(status_code=400, detail=f"head_size_tranche invalide. Valeurs: {list(HEAD_SIZE_TRANCHES.keys())}")

    # Clause taille
    size_min, size_max = HEAD_SIZE_TRANCHES.get(head_size_tranche, (None, None)) if head_size_tranche else (None, None)

    where = """
        (:filter_strict IS NULL OR pc.filter_label_strict = :filter_strict)
        AND (:filter_loose  IS NULL OR pc.filter_label_loose  = :filter_loose)
        AND (:composition   IS NULL OR pc.annotation_composition = :composition)
        AND (:size_min IS NULL OR (pc.head_end_byte - pc.head_start_byte) >= :size_min)
        AND (:size_max IS NULL OR (pc.head_end_byte - pc.head_start_byte) <  :size_max)
    """

    order = """
        CASE
            WHEN :filter_strict IS NOT NULL AND :filter_loose IS NULL
                THEN pc.nb_alignments_strict
            WHEN :filter_loose IS NOT NULL AND :filter_strict IS NULL
                THEN pc.nb_alignments_loose
            ELSE pc.nb_alignments_strict + pc.nb_alignments_loose
        END DESC,
        pc.cluster_id ASC
    """

    params = {
        "filter_strict": filter_label_strict,
        "filter_loose":  filter_label_loose,
        "composition":   annotation_composition,
        "size_min":      size_min,
        "size_max":      size_max,
        "limit":         limit,
        "offset":        offset,
    }

    rows = db.execute(text(f"""
        SELECT
            pc.cluster_id, pc.source_filename, pc.source_title,
            pc.source_text_date, pc.nb_passages,
            pc.nb_alignments_strict, pc.nb_alignments_loose,
            pc.annotation_composition,
            pc.filter_label_strict, pc.filter_label_loose,
            (pc.head_end_byte - pc.head_start_byte) AS head_size
        FROM positional_clusters pc
        WHERE {where}
        ORDER BY {order}
        LIMIT :limit OFFSET :offset
    """), params).mappings().all()

    total = db.execute(text(f"""
        SELECT COUNT(*) FROM positional_clusters pc WHERE {where}
    """), params).scalar()

    return {
        "limit": limit, "offset": offset, "total": total,
        "filter_label_strict":    filter_label_strict,
        "filter_label_loose":     filter_label_loose,
        "annotation_composition": annotation_composition,
        "head_size_tranche":      head_size_tranche,
        "items": list(rows),
    }


# ---------------------------------------------------------------------------
# Récapitulatifs
# ---------------------------------------------------------------------------

@router.get("/filter_summary")
def positional_filter_summary(db: Session = Depends(get_db)):
    sql = text("""
        SELECT filter_label_strict, filter_label_loose, COUNT(*)::int AS nb_clusters
        FROM positional_clusters
        GROUP BY filter_label_strict, filter_label_loose
        ORDER BY nb_clusters DESC, filter_label_strict, filter_label_loose
    """)
    return {"items": list(db.execute(sql).mappings().all())}


@router.get("/composition_summary")
def positional_composition_summary(db: Session = Depends(get_db)):
    sql = text("""
        SELECT 'strict' AS mode, filter_label_strict AS filter_label,
               annotation_composition, COUNT(*)::int AS nb_clusters
        FROM positional_clusters
        GROUP BY filter_label_strict, annotation_composition
        UNION ALL
        SELECT 'loose' AS mode, filter_label_loose AS filter_label,
               annotation_composition, COUNT(*)::int AS nb_clusters
        FROM positional_clusters
        GROUP BY filter_label_loose, annotation_composition
        ORDER BY mode, nb_clusters DESC, annotation_composition ASC
    """)
    return {"items": list(db.execute(sql).mappings().all())}


@router.get("/composition_values")
def positional_composition_values(db: Session = Depends(get_db)):
    sql = text("""
        SELECT DISTINCT annotation_composition
        FROM positional_clusters
        WHERE annotation_composition IS NOT NULL
        ORDER BY annotation_composition ASC
    """)
    rows = db.execute(sql).mappings().all()
    return {"items": [r["annotation_composition"] for r in rows]}


@router.get("/head_size_distribution")
def positional_head_size_distribution(db: Session = Depends(get_db)):
    """Distribution des clusters par tranche de taille de passage de tête."""
    sql = text("""
        SELECT
            CASE
                WHEN (head_end_byte - head_start_byte) < 1000   THEN 'lt1000'
                WHEN (head_end_byte - head_start_byte) < 5000   THEN '1000_5000'
                WHEN (head_end_byte - head_start_byte) < 10000  THEN '5000_10000'
                ELSE                                                  'gt10000'
            END AS tranche,
            COUNT(*)::int AS nb_clusters,
            MIN(head_end_byte - head_start_byte) AS min_size,
            MAX(head_end_byte - head_start_byte) AS max_size
        FROM positional_clusters
        GROUP BY tranche
        ORDER BY tranche
    """)
    rows = db.execute(sql).mappings().all()
    return {"items": list(rows)}


# ---------------------------------------------------------------------------
# Détail cluster : métadonnées + passage de tête + alignements paginés
# ---------------------------------------------------------------------------

@router.get("/{cluster_id}/head")
def positional_cluster_head(
    cluster_id: int,
    mode: str = Query("strict"),
    limit: int = Query(PAGE_SIZE_DETAIL, ge=1, le=200),
    offset: int = Query(0, ge=0),
    annotation_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if mode not in ALLOWED_MODES:
        raise HTTPException(status_code=400, detail="mode invalide")
    if annotation_status and annotation_status.upper() not in ALLOWED_ANNOT_STATUSES:
        raise HTTPException(status_code=400, detail="annotation_status invalide")

    cluster_sql = text("""
        SELECT
            pc.cluster_id, pc.source_text_id, pc.source_filename, pc.source_title,
            pc.source_text_date, pc.head_passage_id, pc.head_start_byte, pc.head_end_byte,
            (pc.head_end_byte - pc.head_start_byte) AS head_size,
            pc.nb_passages, pc.nb_alignments_strict, pc.nb_alignments_loose,
            pc.annotation_composition, pc.filter_label_strict, pc.filter_label_loose,
            p.context_before AS head_context_before,
            p.content        AS head_content,
            p.context_after  AS head_context_after,
            COALESCE(NULLIF(string_agg(DISTINCT a.name, ', ' ORDER BY a.name), ''), NULL) AS source_authors
        FROM positional_clusters pc
        LEFT JOIN passages p ON p.passage_id = pc.head_passage_id
        LEFT JOIN text_authors ta ON ta.text_id = pc.source_text_id
        LEFT JOIN authors a ON a.author_id = ta.author_id
        WHERE pc.cluster_id = :cluster_id
        GROUP BY
            pc.cluster_id, pc.source_text_id, pc.source_filename, pc.source_title,
            pc.source_text_date, pc.head_passage_id, pc.head_start_byte, pc.head_end_byte,
            pc.nb_passages, pc.nb_alignments_strict, pc.nb_alignments_loose,
            pc.annotation_composition, pc.filter_label_strict, pc.filter_label_loose,
            p.context_before, p.content, p.context_after
    """)
    cluster_row = db.execute(cluster_sql, {"cluster_id": cluster_id}).mappings().first()
    if not cluster_row:
        raise HTTPException(status_code=404, detail="cluster_id introuvable")

    aln_sql = text("""
        WITH alns AS (
            SELECT
                pca.id, pca.alignment_id, pca.mode,
                pca.source_passage_id, pca.source_role,
                pca.target_passage_id, pca.target_filename,
                pca.target_title, pca.target_date,
                pca.annotation_status AS computed_status,
                pca.annotation_comment AS computed_comment,
                sp.context_before AS source_context_before,
                sp.content        AS source_content,
                sp.context_after  AS source_context_after,
                tp.context_before AS target_context_before,
                tp.content        AS target_content,
                tp.context_after  AS target_context_after,
                COALESCE(NULLIF(tt.title, ''), tt.filename) AS target_work_title,
                COALESCE(tt.first_publication_date, tt.publication_date) AS target_work_date,
                COALESCE(NULLIF(string_agg(DISTINCT a.name, ', ' ORDER BY a.name), ''), NULL) AS target_authors
            FROM positional_cluster_alignments pca
            LEFT JOIN passages sp ON sp.passage_id = pca.source_passage_id
            LEFT JOIN passages tp ON tp.passage_id = pca.target_passage_id
            LEFT JOIN texts tt ON tt.text_id = tp.text_id
            LEFT JOIN text_authors ta ON ta.text_id = tt.text_id
            LEFT JOIN authors a ON a.author_id = ta.author_id
            WHERE pca.cluster_id = :cluster_id AND pca.mode = :mode
            GROUP BY
                pca.id, pca.alignment_id, pca.mode, pca.source_passage_id, pca.source_role,
                pca.target_passage_id, pca.target_filename, pca.target_title, pca.target_date,
                pca.annotation_status, pca.annotation_comment,
                sp.context_before, sp.content, sp.context_after,
                tp.context_before, tp.content, tp.context_after,
                tt.title, tt.filename, tt.first_publication_date, tt.publication_date
        ),
        latest_status AS (
            SELECT DISTINCT ON (ann.alignment_id)
                ann.alignment_id,
                upper(ann.status::text) AS latest_human_status
            FROM annotations ann
            JOIN alns ON alns.alignment_id = ann.alignment_id
            ORDER BY ann.alignment_id, ann.created_at DESC, ann.annotation_id DESC
        )
        SELECT
            alns.*,
            COALESCE(ls.latest_human_status, 'UNREVIEWED') AS latest_human_status
        FROM alns
        LEFT JOIN latest_status ls ON ls.alignment_id = alns.alignment_id
        WHERE (
            :annot_status IS NULL
            OR COALESCE(ls.latest_human_status, 'UNREVIEWED') = upper(:annot_status)
        )
        ORDER BY alns.source_role DESC, alns.id ASC
        LIMIT :limit OFFSET :offset
    """)

    count_sql = text("""
        WITH alns AS (
            SELECT pca.alignment_id
            FROM positional_cluster_alignments pca
            WHERE pca.cluster_id = :cluster_id AND pca.mode = :mode
        ),
        latest_status AS (
            SELECT DISTINCT ON (ann.alignment_id)
                ann.alignment_id,
                upper(ann.status::text) AS latest_human_status
            FROM annotations ann
            JOIN alns ON alns.alignment_id = ann.alignment_id
            ORDER BY ann.alignment_id, ann.created_at DESC, ann.annotation_id DESC
        )
        SELECT COUNT(*)
        FROM alns
        LEFT JOIN latest_status ls ON ls.alignment_id = alns.alignment_id
        WHERE (
            :annot_status IS NULL
            OR COALESCE(ls.latest_human_status, 'UNREVIEWED') = upper(:annot_status)
        )
    """)

    aln_params = {
        "cluster_id":   cluster_id,
        "mode":         mode,
        "annot_status": annotation_status.upper() if annotation_status else None,
        "limit":        limit,
        "offset":       offset,
    }
    count_params = {
        "cluster_id":   cluster_id,
        "mode":         mode,
        "annot_status": annotation_status.upper() if annotation_status else None,
    }

    alignment_rows   = db.execute(aln_sql,   aln_params).mappings().all()
    total_alignments = db.execute(count_sql, count_params).scalar()

    return {
        "cluster": dict(cluster_row),
        "mode": mode,
        "limit": limit,
        "offset": offset,
        "total_alignments": total_alignments,
        "annotation_status_filter": annotation_status,
        "alignments": [dict(r) for r in alignment_rows],
    }


# ---------------------------------------------------------------------------
# Distribution des statuts d'annotation humaine pour un cluster
# ---------------------------------------------------------------------------

@router.get("/{cluster_id}/annotation_distribution")
def positional_cluster_annotation_distribution(
    cluster_id: int,
    mode: str = Query("strict"),
    db: Session = Depends(get_db),
):
    if mode not in ALLOWED_MODES:
        raise HTTPException(status_code=400, detail="mode invalide")

    sql = text("""
        WITH alns AS (
            SELECT alignment_id
            FROM positional_cluster_alignments
            WHERE cluster_id = :cluster_id AND mode = :mode
        ),
        latest AS (
            SELECT DISTINCT ON (ann.alignment_id)
                ann.alignment_id,
                upper(ann.status::text) AS status
            FROM annotations ann
            JOIN alns ON alns.alignment_id = ann.alignment_id
            ORDER BY ann.alignment_id, ann.created_at DESC, ann.annotation_id DESC
        )
        SELECT
            COALESCE(l.status, 'UNREVIEWED') AS status,
            COUNT(*)::int AS nb_alignments
        FROM alns a
        LEFT JOIN latest l ON l.alignment_id = a.alignment_id
        GROUP BY COALESCE(l.status, 'UNREVIEWED')
        ORDER BY nb_alignments DESC, status ASC
    """)
    rows = db.execute(sql, {"cluster_id": cluster_id, "mode": mode}).mappings().all()
    return {"cluster_id": cluster_id, "mode": mode, "items": list(rows)}


# ---------------------------------------------------------------------------
# Annotations latest par user pour un alignement
# ---------------------------------------------------------------------------

@router.get("/alignments/{alignment_id}/annotations/latest")
def positional_alignment_annotations_latest(alignment_id: int, db: Session = Depends(get_db)):
    sql = text("""
        SELECT DISTINCT ON (a.user_id)
            a.annotation_id, a.alignment_id, a.user_id,
            u.email, a.status, a.comment, a.created_at
        FROM public.annotations a
        JOIN public.users u ON u.user_id = a.user_id
        WHERE a.alignment_id = :alignment_id
        ORDER BY a.user_id, a.created_at DESC
    """)
    rows = db.execute(sql, {"alignment_id": alignment_id}).mappings().all()
    return {"alignment_id": alignment_id, "items": list(rows)}


# ---------------------------------------------------------------------------
# Annoter un alignement + mise à jour BDD complète
# ---------------------------------------------------------------------------

@router.post("/alignments/{alignment_id}/annotate")
def positional_annotate_alignment(
    alignment_id: int,
    data: PositionalAnnotationIn,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_dep),
):
    status = (data.status or "").strip().upper()
    if status not in ALLOWED_ANNOT_STATUSES:
        raise HTTPException(status_code=400, detail="status invalide.")

    # Vérifier que l'alignement existe + récupérer le cluster_id
    row = db.execute(
        text("SELECT cluster_id FROM positional_cluster_alignments WHERE alignment_id = :aid LIMIT 1"),
        {"aid": alignment_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="alignment_id introuvable")

    cluster_id = row["cluster_id"]

    # 1) INSERT dans annotations (historique)
    db.execute(text("""
        INSERT INTO public.annotations
          (alignment_id, user_id, status, comment, created_at, updated_at)
        VALUES (:aid, :uid, :status, :comment, NOW(), NOW())
    """), {"aid": alignment_id, "uid": user["user_id"], "status": status, "comment": data.comment})

    # 2) Recalcul complet : positional_cluster_alignments + positional_clusters
    _recompute_cluster_meta(db, cluster_id)

    db.commit()
    return {
        "ok": True,
        "alignment_id": alignment_id,
        "cluster_id": cluster_id,
        "user": {"user_id": user["user_id"], "email": user["email"]},
        "saved": {"status": status, "comment": data.comment},
    }


# ---------------------------------------------------------------------------
# Propager une annotation à tout le cluster + mise à jour BDD complète
# ---------------------------------------------------------------------------

@router.post("/{cluster_id}/propagate")
def positional_propagate_cluster(
    cluster_id: int,
    data: PositionalPropagateIn,
    mode: str = Query("strict"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_dep),
):
    status = (data.status or "").strip().upper()
    if status not in ALLOWED_ANNOT_STATUSES:
        raise HTTPException(status_code=400, detail="status invalide.")
    if mode not in ALLOWED_MODES:
        raise HTTPException(status_code=400, detail="mode invalide")

    exists = db.execute(
        text("SELECT 1 FROM positional_clusters WHERE cluster_id = :cid"), {"cid": cluster_id}
    ).scalar()
    if not exists:
        raise HTTPException(status_code=404, detail="cluster_id introuvable")

    # 1) Mass INSERT dans annotations pour tous les alignements du cluster/mode
    res = db.execute(text("""
        WITH alns AS (
            SELECT DISTINCT alignment_id
            FROM positional_cluster_alignments
            WHERE cluster_id = :cid AND mode = :mode
        )
        INSERT INTO public.annotations (alignment_id, user_id, status, comment, created_at, updated_at)
        SELECT a.alignment_id, :uid, :status, :comment, NOW(), NOW()
        FROM alns a
        RETURNING alignment_id
    """), {"cid": cluster_id, "mode": mode, "uid": user["user_id"], "status": status, "comment": data.comment})

    inserted_ids = [r[0] for r in res.fetchall()]

    # 2) Recalcul complet : positional_cluster_alignments + positional_clusters
    _recompute_cluster_meta(db, cluster_id)

    db.commit()
    return {
        "ok": True,
        "cluster_id": cluster_id,
        "mode": mode,
        "user": {"user_id": user["user_id"], "email": user["email"]},
        "saved": {"status": status, "comment": data.comment},
        "n_alignments_annotated": len(inserted_ids),
    }


# ---------------------------------------------------------------------------
# Next cluster — trié par nb_alignments décroissant
# ---------------------------------------------------------------------------

@router.get("/{cluster_id}/next")
def positional_next_cluster(
    cluster_id: int,
    filter_label_strict: Optional[str] = Query(None),
    filter_label_loose:  Optional[str] = Query(None),
    annotation_composition: Optional[str] = Query(None),
    head_size_tranche: Optional[str] = Query(None),
    mode: str = Query("strict", description="strict | loose — pour le tri nb_alignments"),
    db: Session = Depends(get_db),
):
    if head_size_tranche and head_size_tranche not in HEAD_SIZE_TRANCHES:
        raise HTTPException(status_code=400, detail="head_size_tranche invalide")

    size_min, size_max = HEAD_SIZE_TRANCHES.get(head_size_tranche, (None, None)) if head_size_tranche else (None, None)

    # Récupérer le nb_alignments du cluster courant pour le tri
    current = db.execute(text("""
        SELECT cluster_id, nb_alignments_strict, nb_alignments_loose
        FROM positional_clusters
        WHERE cluster_id = :cid
    """), {"cid": cluster_id}).mappings().first()

    if not current:
        raise HTTPException(status_code=404, detail="cluster_id introuvable")

    # Colonne de tri selon le mode
    if mode == "loose":
        current_nb = current["nb_alignments_loose"]
        sort_col   = "nb_alignments_loose"
    else:
        current_nb = current["nb_alignments_strict"]
        sort_col   = "nb_alignments_strict"

    # Cluster suivant = même nb_alignments + cluster_id plus grand,
    # ou nb_alignments plus petit — avec les mêmes filtres
    row = db.execute(text(f"""
        SELECT cluster_id
        FROM positional_clusters
        WHERE
            (:filter_strict IS NULL OR filter_label_strict = :filter_strict)
            AND (:filter_loose  IS NULL OR filter_label_loose  = :filter_loose)
            AND (:composition   IS NULL OR annotation_composition = :composition)
            AND (:size_min IS NULL OR (head_end_byte - head_start_byte) >= :size_min)
            AND (:size_max IS NULL OR (head_end_byte - head_start_byte) <  :size_max)
            AND (
                {sort_col} < :current_nb
                OR ({sort_col} = :current_nb AND cluster_id > :current_id)
            )
        ORDER BY {sort_col} DESC, cluster_id ASC
        LIMIT 1
    """), {
        "current_id":    cluster_id,
        "current_nb":    current_nb,
        "filter_strict": filter_label_strict,
        "filter_loose":  filter_label_loose,
        "composition":   annotation_composition,
        "size_min":      size_min,
        "size_max":      size_max,
    }).mappings().first()

    return {
        "current_cluster_id": cluster_id,
        "next_cluster_id":    row["cluster_id"] if row else None,
    }