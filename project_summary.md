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