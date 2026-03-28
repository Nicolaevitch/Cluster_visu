🎯 Objectif du projet

Cluster Visu est une interface web d’annotation et d’exploration de clusters d’alignements textuels issus du projet ModERN.

Le système permet de :

visualiser des clusters d’alignements textuels

inspecter le triangle de référence d’un cluster

afficher les passages sources et cibles

consulter les annotations des utilisateurs

annoter un alignment

propager une annotation à tout un cluster

suivre l’état global de l’annotation via un tableau de statistiques

Le projet est conçu comme un POC d’annotation collaborative pour valider la qualité des alignements.


Structure du projet
cluster_visu
│
├── backend
│   └── app
│       ├── main.py
│       ├── auth.py
│       ├── db.py
│       ├── settings.py
│       └── __init__.py
│
├── frontend
│   └── cluster_modern
│       ├── src
│       ├── public
│       ├── dist
│       ├── index.html
│       ├── package.json
│       └── package-lock.json
│
├── cluster_visu (venv Python)
│
├── schema.sql
├── README.md
└── project_summary.md

Architecture déploiement 

Navigateur
     │
     ▼
Frontend (Vite / JS)
     │
     ▼
Apache (reverse proxy)
     │
     ▼
Backend FastAPI (Gunicorn + Uvicorn)
     │
     ▼
PostgreSQL

Backend (FastAPI)

📂 backend/app

Le backend expose une API REST permettant d’interagir avec la base de données.

Technologies :

FastAPI

SQLAlchemy

Gunicorn + Uvicorn

JWT simple pour l’authentification

PostgreSQL

Table : 

-- User Management
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY NOT NULL,
    email VARCHAR NOT NULL,
    password_hash VARCHAR NOT NULL,
    preferences JSON,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

CREATE TABLE roles (
    role_id INTEGER PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    description VARCHAR
);

CREATE TABLE user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- Content Management
CREATE TABLE texts (
    text_id INTEGER PRIMARY KEY NOT NULL,
    title VARCHAR NOT NULL,
    filename VARCHAR NOT NULL,
    publication_date DATE,
    first_publication_date DATE,
    classification VARCHAR,
    word_length INTEGER,
    title_key VARCHAR,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE authors (
    author_id INTEGER PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    bnf_name VARCHAR,
    bnf_ark VARCHAR,
    birth_date DATE,
    death_date DATE,
    birth_place VARCHAR,
    death_place VARCHAR,
    country VARCHAR,
    language VARCHAR,
    gender VARCHAR,
    notes TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE text_authors (
    text_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    created_at TIMESTAMP,
    PRIMARY KEY (text_id, author_id),
    FOREIGN KEY (text_id) REFERENCES texts(text_id),
    FOREIGN KEY (author_id) REFERENCES authors(author_id)
);

-- Text Analysis
CREATE TABLE passages (
    passage_id INTEGER PRIMARY KEY NOT NULL,
    text_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    context_before TEXT,
    context_after TEXT,
    start_byte INTEGER,
    end_byte INTEGER,
    word_count INTEGER,
    language VARCHAR,
    automatic_classification VARCHAR,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (text_id) REFERENCES texts(text_id)
);

CREATE TABLE alignments (
    alignment_id INTEGER PRIMARY KEY NOT NULL,
    source_passage_id INTEGER NOT NULL,
    target_passage_id INTEGER NOT NULL,
    levenshtein_similarity DOUBLE PRECISION,
    vector_similarity DOUBLE PRECISION,
    diff_data JSON,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (source_passage_id) REFERENCES passages(passage_id),
    FOREIGN KEY (target_passage_id) REFERENCES passages(passage_id)
);

CREATE TABLE annotations (
    annotation_id INTEGER PRIMARY KEY NOT NULL,
    alignment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status annotation_status NOT NULL,  -- Custom enum type
    comment TEXT,
    annotation_metadata JSON,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (alignment_id) REFERENCES alignments(alignment_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Lists for organizing alignments
CREATE TABLE lists (
    list_id INTEGER PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE list_alignments (
    list_id INTEGER NOT NULL,
    alignment_id INTEGER NOT NULL,
    added_at TIMESTAMP NOT NULL,
    notes TEXT,
    PRIMARY KEY (list_id, alignment_id),
    FOREIGN KEY (list_id) REFERENCES lists(list_id),
    FOREIGN KEY (alignment_id) REFERENCES alignments(alignment_id)
);

-- Version Control
CREATE TABLE alembic_version (
    version_num VARCHAR NOT NULL
);
-- User Management
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY NOT NULL,
    email VARCHAR NOT NULL,
    password_hash VARCHAR NOT NULL,
    preferences JSON,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP
);

CREATE TABLE roles (
    role_id INTEGER PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    description VARCHAR
);

CREATE TABLE user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- Content Management
CREATE TABLE texts (
    text_id INTEGER PRIMARY KEY NOT NULL,
    title VARCHAR NOT NULL,
    filename VARCHAR NOT NULL,
    publication_date DATE,
    first_publication_date DATE,
    classification VARCHAR,
    word_length INTEGER,
    title_key VARCHAR,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE authors (
    author_id INTEGER PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    bnf_name VARCHAR,
    bnf_ark VARCHAR,
    birth_date DATE,
    death_date DATE,
    birth_place VARCHAR,
    death_place VARCHAR,
    country VARCHAR,
    language VARCHAR,
    gender VARCHAR,
    notes TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE text_authors (
    text_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    created_at TIMESTAMP,
    PRIMARY KEY (text_id, author_id),
    FOREIGN KEY (text_id) REFERENCES texts(text_id),
    FOREIGN KEY (author_id) REFERENCES authors(author_id)
);

-- Text Analysis
CREATE TABLE passages (
    passage_id INTEGER PRIMARY KEY NOT NULL,
    text_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    context_before TEXT,
    context_after TEXT,
    start_byte INTEGER,
    end_byte INTEGER,
    word_count INTEGER,
    language VARCHAR,
    automatic_classification VARCHAR,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (text_id) REFERENCES texts(text_id)
);

CREATE TABLE alignments (
    alignment_id INTEGER PRIMARY KEY NOT NULL,
    source_passage_id INTEGER NOT NULL,
    target_passage_id INTEGER NOT NULL,
    levenshtein_similarity DOUBLE PRECISION,
    vector_similarity DOUBLE PRECISION,
    diff_data JSON,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (source_passage_id) REFERENCES passages(passage_id),
    FOREIGN KEY (target_passage_id) REFERENCES passages(passage_id)
);

CREATE TABLE annotations (
    annotation_id INTEGER PRIMARY KEY NOT NULL,
    alignment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status annotation_status NOT NULL,  -- Custom enum type
    comment TEXT,
    annotation_metadata JSON,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (alignment_id) REFERENCES alignments(alignment_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Lists for organizing alignments
CREATE TABLE lists (
    list_id INTEGER PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE list_alignments (
    list_id INTEGER NOT NULL,
    alignment_id INTEGER NOT NULL,
    added_at TIMESTAMP NOT NULL,
    notes TEXT,
    PRIMARY KEY (list_id, alignment_id),
    FOREIGN KEY (list_id) REFERENCES lists(list_id),
    FOREIGN KEY (alignment_id) REFERENCES alignments(alignment_id)
);

-- Version Control
CREATE TABLE alembic_version (
    version_num VARCHAR NOT NULL
);
-- Custom enum type for annotations
CREATE TYPE annotation_status AS ENUM (
    'OUI',
    'NON',
    'DOUTEUX',
    'DISCARDED',
    'UNREVIEWED'
);

-- Triangle-based clustering
CREATE TABLE triangles (
    id_triangle INTEGER PRIMARY KEY NOT NULL,
    cluster_id INTEGER NOT NULL,
    alignment_ab_id INTEGER NOT NULL,
    alignment_ac_id INTEGER NOT NULL,
    alignment_bc_id INTEGER NOT NULL,
    completeness DOUBLE PRECISION,
    consistency DOUBLE PRECISION,
    confidence DOUBLE PRECISION,
    can_propagate BOOLEAN,
    source_file VARCHAR,
    old_alignment_concatenated TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (alignment_ab_id) REFERENCES alignments(alignment_id),
    FOREIGN KEY (alignment_ac_id) REFERENCES alignments(alignment_id),
    FOREIGN KEY (alignment_bc_id) REFERENCES alignments(alignment_id)
);

CREATE TABLE cluster_meta (
    cluster_id INTEGER PRIMARY KEY NOT NULL,
    oldest_alignment_id INTEGER,
    oldest_source_passage_id INTEGER,
    oldest_text_id INTEGER,
    oldest_filename VARCHAR,
    oldest_text_date DATE,
    computed_at TIMESTAMP,
    triangles_count INTEGER,
    ref_triangle_id INTEGER,
    trio_sorted VARCHAR,
    head_macro_status VARCHAR,
    head_ab_status annotation_status,
    head_ab_comment TEXT,
    head_ab_created_at TIMESTAMP,
    head_ac_status annotation_status,
    head_ac_comment TEXT,
    head_ac_created_at TIMESTAMP,
    head_bc_status annotation_status,
    head_bc_comment TEXT,
    head_bc_created_at TIMESTAMP,
    head_trio_computed_at TIMESTAMP,
    FOREIGN KEY (oldest_alignment_id) REFERENCES alignments(alignment_id),
    FOREIGN KEY (oldest_source_passage_id) REFERENCES passages(passage_id),
    FOREIGN KEY (oldest_text_id) REFERENCES texts(text_id),
    FOREIGN KEY (ref_triangle_id) REFERENCES triangles(id_triangle)
);

-- Useful indexes for annotation performance
CREATE INDEX idx_annotations_alignment_latest
ON annotations (alignment_id, updated_at DESC, created_at DESC, annotation_id DESC);

CREATE INDEX idx_triangles_ab
ON triangles (alignment_ab_id);

CREATE INDEX idx_triangles_ac
ON triangles (alignment_ac_id);

CREATE INDEX idx_triangles_bc
ON triangles (alignment_bc_id);

CREATE INDEX idx_triangles_cluster_id
ON triangles (cluster_id);

CREATE INDEX idx_passages_text_id
ON passages (text_id);

CREATE INDEX idx_texts_filename
ON texts (filename);

CREATE INDEX idx_text_authors_author_id
ON text_authors (author_id);

CREATE INDEX idx_alignments_source_passage_id
ON alignments (source_passage_id);

CREATE INDEX idx_alignments_target_passage_id
ON alignments (target_passage_id);
