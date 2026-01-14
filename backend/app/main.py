from typing import Optional

from fastapi import FastAPI, Depends, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import get_db

app = FastAPI(title="Cluster visu (POC)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_STATUSES = {"discarded", "oui", "non", "unreviewed"}


def normalize_trio(trio: Optional[str]) -> Optional[str]:
    if trio is None or trio.strip() == "":
        return None

    parts = [p.strip().lower() for p in trio.split(",") if p.strip()]
    if len(parts) != 3:
        raise ValueError("trio must contain exactly 3 values: discarded|oui|non|unreviewed")

    for p in parts:
        if p not in ALLOWED_STATUSES:
            raise ValueError(f"invalid status '{p}' (allowed: {sorted(ALLOWED_STATUSES)})")

    parts.sort()
    return "-".join(parts)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db_ping")
def db_ping(db: Session = Depends(get_db)):
    v = db.execute(text("SELECT 1")).scalar()
    return {"db": v}


@app.get("/clusters")
def list_clusters(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    trio: Optional[str] = Query(
        None,
        description="Filtre trio_sorted (ordre libre). Ex: oui,non,unreviewed",
    ),
    db: Session = Depends(get_db),
):
    try:
        trio_key = normalize_trio(trio)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    sql = text("""
        SELECT
          cluster_id,
          triangles_count,
          oldest_alignment_id,
          ref_triangle_id,
          trio_sorted,
          oldest_filename,
          oldest_text_date
        FROM cluster_meta
        WHERE (:trio_is_null = true OR lower(trio_sorted) = :trio_key)
        ORDER BY triangles_count DESC, cluster_id ASC
        LIMIT :limit OFFSET :offset
    """)

    params = {
        "limit": limit,
        "offset": offset,
        "trio_is_null": trio_key is None,
        "trio_key": trio_key,
    }

    rows = db.execute(sql, params).mappings().all()
    return {"limit": limit, "offset": offset, "trio": trio, "items": list(rows)}


@app.get("/clusters/{cluster_id}/triangles")
def cluster_triangles(
    cluster_id: int,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    sql = text("""
        SELECT
            id_triangle,
            cluster_id,
            source_file,
            completeness,
            consistency,
            confidence,
            can_propagate,
            alignment_ab_id,
            alignment_bc_id,
            alignment_ac_id,
            ab_annotation_status,
            bc_annotation_status,
            ac_annotation_status,
            ab_annotation_comment,
            bc_annotation_comment,
            ac_annotation_comment
        FROM triangles
        WHERE cluster_id = :cluster_id
        ORDER BY id_triangle ASC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(sql, {"cluster_id": cluster_id, "limit": limit, "offset": offset}).mappings().all()
    return {"cluster_id": cluster_id, "limit": limit, "offset": offset, "items": list(rows)}


@app.get("/clusters/{cluster_id}/head_triangle")
def head_triangle(cluster_id: int, db: Session = Depends(get_db)):
    sql = text("""
WITH ref AS (
  SELECT cluster_id, ref_triangle_id
  FROM cluster_meta
  WHERE cluster_id = :cluster_id
),
t AS (
  SELECT tr.*
  FROM triangles tr
  JOIN ref ON ref.ref_triangle_id = tr.id_triangle
)
SELECT
  t.cluster_id,
  t.id_triangle AS ref_triangle_id,
  t.completeness,
  t.consistency,
  t.confidence,
  t.can_propagate,
  t.alignment_ab_id,
  t.alignment_bc_id,
  t.alignment_ac_id,

  -- AB
  ab.alignment_id AS ab_alignment_id,
  sp_ab.passage_id AS ab_source_passage_id,
  sp_ab.content AS ab_source_content,
  sp_ab.context_before AS ab_source_context_before,
  sp_ab.context_after AS ab_source_context_after,
  tp_ab.passage_id AS ab_target_passage_id,
  tp_ab.content AS ab_target_content,
  tp_ab.context_before AS ab_target_context_before,
  tp_ab.context_after AS ab_target_context_after,

  -- BC
  bc.alignment_id AS bc_alignment_id,
  sp_bc.passage_id AS bc_source_passage_id,
  sp_bc.content AS bc_source_content,
  sp_bc.context_before AS bc_source_context_before,
  sp_bc.context_after AS bc_source_context_after,
  tp_bc.passage_id AS bc_target_passage_id,
  tp_bc.content AS bc_target_content,
  tp_bc.context_before AS bc_target_context_before,
  tp_bc.context_after AS bc_target_context_after,

  -- AC
  ac.alignment_id AS ac_alignment_id,
  sp_ac.passage_id AS ac_source_passage_id,
  sp_ac.content AS ac_source_content,
  sp_ac.context_before AS ac_source_context_before,
  sp_ac.context_after AS ac_source_context_after,
  tp_ac.passage_id AS ac_target_passage_id,
  tp_ac.content AS ac_target_content,
  tp_ac.context_before AS ac_target_context_before,
  tp_ac.context_after AS ac_target_context_after

FROM t

JOIN alignments ab ON ab.alignment_id = t.alignment_ab_id
JOIN passages sp_ab ON sp_ab.passage_id = ab.source_passage_id
JOIN passages tp_ab ON tp_ab.passage_id = ab.target_passage_id

JOIN alignments bc ON bc.alignment_id = t.alignment_bc_id
JOIN passages sp_bc ON sp_bc.passage_id = bc.source_passage_id
JOIN passages tp_bc ON tp_bc.passage_id = bc.target_passage_id

JOIN alignments ac ON ac.alignment_id = t.alignment_ac_id
JOIN passages sp_ac ON sp_ac.passage_id = ac.source_passage_id
JOIN passages tp_ac ON tp_ac.passage_id = ac.target_passage_id
    """)

    row = db.execute(sql, {"cluster_id": cluster_id}).mappings().first()
    if not row:
        raise HTTPException(
            status_code=404,
            detail="No head triangle for this cluster_id (check cluster_meta.ref_triangle_id)",
        )

    return {
        "cluster_id": row["cluster_id"],
        "ref_triangle_id": row["ref_triangle_id"],
        "triangle": {
            "completeness": row["completeness"],
            "consistency": row["consistency"],
            "confidence": row["confidence"],
            "can_propagate": row["can_propagate"],
            "alignment_ab_id": row["alignment_ab_id"],
            "alignment_bc_id": row["alignment_bc_id"],
            "alignment_ac_id": row["alignment_ac_id"],
        },
        "alignments": {
            "ab": {
                "alignment_id": row["ab_alignment_id"],
                "source": {
                    "passage_id": row["ab_source_passage_id"],
                    "content": row["ab_source_content"],
                    "context_before": row["ab_source_context_before"],
                    "context_after": row["ab_source_context_after"],
                },
                "target": {
                    "passage_id": row["ab_target_passage_id"],
                    "content": row["ab_target_content"],
                    "context_before": row["ab_target_context_before"],
                    "context_after": row["ab_target_context_after"],
                },
            },
            "bc": {
                "alignment_id": row["bc_alignment_id"],
                "source": {
                    "passage_id": row["bc_source_passage_id"],
                    "content": row["bc_source_content"],
                    "context_before": row["bc_source_context_before"],
                    "context_after": row["bc_source_context_after"],
                },
                "target": {
                    "passage_id": row["bc_target_passage_id"],
                    "content": row["bc_target_content"],
                    "context_before": row["bc_target_context_before"],
                    "context_after": row["bc_target_context_after"],
                },
            },
            "ac": {
                "alignment_id": row["ac_alignment_id"],
                "source": {
                    "passage_id": row["ac_source_passage_id"],
                    "content": row["ac_source_content"],
                    "context_before": row["ac_source_context_before"],
                    "context_after": row["ac_source_context_after"],
                },
                "target": {
                    "passage_id": row["ac_target_passage_id"],
                    "content": row["ac_target_content"],
                    "context_before": row["ac_target_context_before"],
                    "context_after": row["ac_target_context_after"],
                },
            },
        },
    }

@app.get("/clusters/{cluster_id}/summary")
def cluster_summary(cluster_id: int, db: Session = Depends(get_db)):
    sql = text("""
WITH cm AS (
  SELECT
    cluster_id,
    triangles_count,
    oldest_source_passage_id,
    oldest_text_id
  FROM cluster_meta
  WHERE cluster_id = :cluster_id
),
uniq_alignments AS (
  SELECT COUNT(*)::int AS unique_alignments_count
  FROM (
    SELECT alignment_ab_id AS alignment_id
    FROM triangles
    WHERE cluster_id = :cluster_id
    UNION
    SELECT alignment_bc_id
    FROM triangles
    WHERE cluster_id = :cluster_id
    UNION
    SELECT alignment_ac_id
    FROM triangles
    WHERE cluster_id = :cluster_id
  ) u
),
oldest_text AS (
  SELECT
    COALESCE(cm.oldest_text_id, p.text_id) AS text_id
  FROM cm
  LEFT JOIN passages p ON p.passage_id = cm.oldest_source_passage_id
),
authors AS (
  SELECT
    COALESCE(
      NULLIF(string_agg(a.name, ', ' ORDER BY a.name), ''),
      NULL
    ) AS oldest_author_name
  FROM oldest_text ot
  LEFT JOIN text_authors ta ON ta.text_id = ot.text_id
  LEFT JOIN authors a ON a.author_id = ta.author_id
),
work AS (
  SELECT
    COALESCE(NULLIF(t.title, ''), t.filename) AS oldest_work_title,
    COALESCE(t.first_publication_date, t.publication_date) AS oldest_work_date
  FROM oldest_text ot
  LEFT JOIN texts t ON t.text_id = ot.text_id
)
SELECT
  cm.cluster_id,
  ua.unique_alignments_count,
  cm.triangles_count,
  au.oldest_author_name,
  w.oldest_work_title,
  w.oldest_work_date
FROM cm
CROSS JOIN uniq_alignments ua
CROSS JOIN authors au
CROSS JOIN work w
    """)

    row = db.execute(sql, {"cluster_id": cluster_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="cluster_id not found in cluster_meta")

    return dict(row)

@app.get("/passages/{passage_id}/meta")
def passage_meta(passage_id: int, db: Session = Depends(get_db)):
    sql = text("""
SELECT
  p.passage_id,
  p.text_id,
  COALESCE(NULLIF(t.title, ''), t.filename) AS work_title,
  COALESCE(t.first_publication_date, t.publication_date) AS work_date,
  COALESCE(NULLIF(string_agg(a.name, ', ' ORDER BY a.name), ''), NULL) AS authors
FROM passages p
JOIN texts t ON t.text_id = p.text_id
LEFT JOIN text_authors ta ON ta.text_id = t.text_id
LEFT JOIN authors a ON a.author_id = ta.author_id
WHERE p.passage_id = :passage_id
GROUP BY p.passage_id, p.text_id, t.title, t.filename, t.first_publication_date, t.publication_date
    """)
    row = db.execute(sql, {"passage_id": passage_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="passage_id not found")
    return dict(row)
