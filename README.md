# Elite Skin CRM — crm.eliteskinsa.com

Web app عربي RTL لإدارة زيارات المناديب الطبية — مبني من نظام SARA (4 مناديب × 4 منتجات × 170 طبيب/عيادة).

## Stack
Next.js 16 (App Router) + TypeScript + Tailwind CSS + PostgreSQL 16 + pg + bcryptjs + zod

## Run locally
```bash
cp .env.example .env   # then edit POSTGRES_PASSWORD / BOOTSTRAP_*
npm install
npm run import:workbook -- "C:/path/to/نظام_SARA_النهائي_مقفول (4).xlsx"  # regenerates data/*.json
# or use committed seed data as-is
docker compose up --build
# app at http://localhost:3100
```

## Environment
Required at first boot (docker):
- `POSTGRES_PASSWORD` — strong password for DB
- `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (12+ chars) — first admin
- `BOOTSTRAP_ADMIN_NAME` — optional display name
- `REP_BOOTSTRAP_PASSWORD` — optional, if set creates/updates 4 reps with same initial password (also 12+ chars)

Local dev without docker: set `DATABASE_URL` and `BOOTSTRAP_*` in `.env` then:
```bash
npm run db:migrate
npm run db:seed
npm run dev
```

## Roles
- **admin** — sees all visits, manages doctors, full dashboard
- **sales_rep** — sees only own visits, product locked to `assigned_product_id`, cannot manage master data

## Visit rules
- `notes` required ≥10 chars (enforced in DB CHECK + zod)
- `visited_at` defaults to `now()` server-side; client may omit
- `status`: planned | completed | cancelled | follow_up
- visit_items kind: sample | order

## Deploy on VPS (148.230.113.18) behind Nginx → crm.eliteskinsa.com
1. DNS already: `crm` A → 148.230.113.18
2. On VPS:
   ```bash
   mkdir -p /opt/elite-crm && cd /opt/elite-crm
   # copy project files here (scp or git)
   cp .env.example .env && nano .env  # fill secrets
   docker compose up -d --build
   docker compose logs -f app
   curl -s http://127.0.0.1:3100/api/health
   ```
3. Nginx:
   ```nginx
   server {
     server_name crm.eliteskinsa.com;
     client_max_body_size 10m;
     location / {
       proxy_pass http://127.0.0.1:3100;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection $connection_upgrade;
     }
   }
   ```
   Then `nginx -t && systemctl reload nginx` and `certbot --nginx -d crm.eliteskinsa.com --redirect`
# auto-deploy test 2026-10-30T11:36:25+00:00
# auto-deploy test 2 2026-10-30T11:45:59+00:00
# auto-deploy test 3 2026-10-30T18:36:43+00:00
# auto-deploy test 4 2026-10-30T18:47:14+00:00
