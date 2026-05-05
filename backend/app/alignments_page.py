from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import get_db

router = APIRouter(prefix="/alignments", tags=["alignments"])


@router.get("/search")
def search_alignments(
    q: Optional[str] = Query(None),
    source_author: Optional[str] = Query(None),
    source_text: Optional[str] = Query(None),
    source_alignment_id: Optional[int] = Query(None),
    target_author: Optional[str] = Query(None),
    target_text: Optional[str] = Query(None),
    target_alignment_id: Optional[int] = Query(None),
    common_author: Optional[str] = Query(None),
    common_text: Optional[str] = Query(None),
    common_alignment_id: Optional[int] = Query(None),
    triangle_id: Optional[int] = Query(None),
    year_start: Optional[int] = Query(None),
    year_end: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    where_clauses = []
    params = {"limit": limit}

    if source_alignment_id is not None:
        where_clauses.append("a.alignment_id = :source_alignment_id")
        params["source_alignment_id"] = source_alignment_id

    if target_alignment_id is not None:
        where_clauses.append("a.alignment_id = :target_alignment_id")
        params["target_alignment_id"] = target_alignment_id

    if common_alignment_id is not None:
        where_clauses.append("a.alignment_id = :common_alignment_id")
        params["common_alignment_id"] = common_alignment_id

    if source_author:
        where_clauses.append("""
            EXISTS (
                SELECT 1
                FROM text_authors tas
                JOIN authors aus ON aus.author_id = tas.author_id
                WHERE tas.text_id = st.text_id
                  AND lower(coalesce(aus.name, '')) LIKE :source_author
            )
        """)
        params["source_author"] = f"%{source_author.lower()}%"

    if source_text:
        where_clauses.append("lower(coalesce(st.title, '')) LIKE :source_text")
        params["source_text"] = f"%{source_text.lower()}%"

    if target_author:
        where_clauses.append("""
            EXISTS (
                SELECT 1
                FROM text_authors tat
                JOIN authors aut ON aut.author_id = tat.author_id
                WHERE tat.text_id = tt.text_id
                  AND lower(coalesce(aut.name, '')) LIKE :target_author
            )
        """)
        params["target_author"] = f"%{target_author.lower()}%"

    if target_text:
        where_clauses.append("lower(coalesce(tt.title, '')) LIKE :target_text")
        params["target_text"] = f"%{target_text.lower()}%"

    if common_author:
        where_clauses.append("""
            (
                EXISTS (
                    SELECT 1
                    FROM text_authors tas2
                    JOIN authors aus2 ON aus2.author_id = tas2.author_id
                    WHERE tas2.text_id = st.text_id
                      AND lower(coalesce(aus2.name, '')) LIKE :common_author
                )
                OR
                EXISTS (
                    SELECT 1
                    FROM text_authors tat2
                    JOIN authors aut2 ON aut2.author_id = tat2.author_id
                    WHERE tat2.text_id = tt.text_id
                      AND lower(coalesce(aut2.name, '')) LIKE :common_author
                )
            )
        """)
        params["common_author"] = f"%{common_author.lower()}%"

    if common_text:
        where_clauses.append("""
            (
                lower(coalesce(st.title, '')) LIKE :common_text
                OR lower(coalesce(tt.title, '')) LIKE :common_text
            )
        """)
        params["common_text"] = f"%{common_text.lower()}%"

    if q:
        where_clauses.append("""
            (
                lower(coalesce(st.title, '')) LIKE :q
                OR lower(coalesce(tt.title, '')) LIKE :q
                OR EXISTS (
                    SELECT 1
                    FROM text_authors tas3
                    JOIN authors aus3 ON aus3.author_id = tas3.author_id
                    WHERE tas3.text_id = st.text_id
                      AND lower(coalesce(aus3.name, '')) LIKE :q
                )
                OR EXISTS (
                    SELECT 1
                    FROM text_authors tat3
                    JOIN authors aut3 ON aut3.author_id = tat3.author_id
                    WHERE tat3.text_id = tt.text_id
                      AND lower(coalesce(aut3.name, '')) LIKE :q
                )
            )
        """)
        params["q"] = f"%{q.lower()}%"

    if triangle_id is not None:
        where_clauses.append("""
            a.alignment_id IN (
                SELECT unnest(ARRAY[
                    t.alignment_ab_id,
                    t.alignment_ac_id,
                    t.alignment_bc_id
                ])
                FROM triangles t
                WHERE t.id_triangle = :triangle_id
            )
        """)
        params["triangle_id"] = triangle_id

    if year_start is not None:
        where_clauses.append("""
            (
                EXTRACT(YEAR FROM COALESCE(st.first_publication_date, st.publication_date)) >= :year_start
                OR EXTRACT(YEAR FROM COALESCE(tt.first_publication_date, tt.publication_date)) >= :year_start
            )
        """)
        params["year_start"] = year_start

    if year_end is not None:
        where_clauses.append("""
            (
                EXTRACT(YEAR FROM COALESCE(st.first_publication_date, st.publication_date)) <= :year_end
                OR EXTRACT(YEAR FROM COALESCE(tt.first_publication_date, tt.publication_date)) <= :year_end
            )
        """)
        params["year_end"] = year_end

    if status:
        where_clauses.append("coalesce(la.status::text, 'UNREVIEWED') = :status")
        params["status"] = status.upper()

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + "\nAND ".join(where_clauses)

    # ── Requête COUNT (total réel sans LIMIT) ─────────────────────────────────
    count_sql = text(f"""
        WITH latest_annotations AS (
            SELECT DISTINCT ON (ann.alignment_id)
                ann.alignment_id,
                ann.status,
                ann.comment,
                ann.updated_at,
                ann.created_at,
                ann.user_id
            FROM annotations ann
            ORDER BY ann.alignment_id, ann.updated_at DESC, ann.created_at DESC, ann.annotation_id DESC
        )
        SELECT COUNT(*) AS total
        FROM alignments a
        JOIN passages sp ON sp.passage_id = a.source_passage_id
        JOIN passages tp ON tp.passage_id = a.target_passage_id
        JOIN texts st ON st.text_id = sp.text_id
        JOIN texts tt ON tt.text_id = tp.text_id
        LEFT JOIN latest_annotations la ON la.alignment_id = a.alignment_id
        {where_sql}
    """)

    total = db.execute(count_sql, params).scalar() or 0

    # ── Requête principale (avec LIMIT) ───────────────────────────────────────
    sql = text(f"""
        WITH latest_annotations AS (
            SELECT DISTINCT ON (ann.alignment_id)
                ann.alignment_id,
                ann.status,
                ann.comment,
                ann.updated_at,
                ann.created_at,
                ann.user_id
            FROM annotations ann
            ORDER BY ann.alignment_id, ann.updated_at DESC, ann.created_at DESC, ann.annotation_id DESC
        )
        SELECT
            a.alignment_id,

            sp.passage_id AS source_passage_id,
            sp.context_before AS source_context_before,
            sp.content AS source_content,
            sp.context_after AS source_context_after,

            st.text_id AS source_text_id,
            st.title AS source_title,
            COALESCE(st.first_publication_date, st.publication_date) AS source_date,
            (
                SELECT string_agg(DISTINCT aus.name, ' | ' ORDER BY aus.name)
                FROM text_authors tas
                JOIN authors aus ON aus.author_id = tas.author_id
                WHERE tas.text_id = st.text_id
            ) AS source_authors,

            tp.passage_id AS target_passage_id,
            tp.context_before AS target_context_before,
            tp.content AS target_content,
            tp.context_after AS target_context_after,

            tt.text_id AS target_text_id,
            tt.title AS target_title,
            COALESCE(tt.first_publication_date, tt.publication_date) AS target_date,
            (
                SELECT string_agg(DISTINCT aut.name, ' | ' ORDER BY aut.name)
                FROM text_authors tat
                JOIN authors aut ON aut.author_id = tat.author_id
                WHERE tat.text_id = tt.text_id
            ) AS target_authors,

            COALESCE(la.status::text, 'UNREVIEWED') AS latest_status,
            la.comment AS latest_comment,
            la.updated_at AS latest_annotation_updated_at

        FROM alignments a
        JOIN passages sp ON sp.passage_id = a.source_passage_id
        JOIN passages tp ON tp.passage_id = a.target_passage_id
        JOIN texts st ON st.text_id = sp.text_id
        JOIN texts tt ON tt.text_id = tp.text_id
        LEFT JOIN latest_annotations la ON la.alignment_id = a.alignment_id

        {where_sql}

        ORDER BY a.alignment_id DESC
        LIMIT :limit
    """)

    rows = db.execute(sql, params).fetchall()

    return {
        "count": len(rows),
        "total": total,
        "results": [dict(row._mapping) for row in rows],
        "applied_filters": {
            "q": q,
            "source_author": source_author,
            "source_text": source_text,
            "source_alignment_id": source_alignment_id,
            "target_author": target_author,
            "target_text": target_text,
            "triangle_id": triangle_id,
            "target_alignment_id": target_alignment_id,
            "common_author": common_author,
            "common_text": common_text,
            "common_alignment_id": common_alignment_id,
            "year_start": year_start,
            "year_end": year_end,
            "status": status,
            "limit": limit,
        },
    }