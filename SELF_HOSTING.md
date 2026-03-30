# Self-Hosting Guide

This guide explains how to deploy the Budget App on TrueNAS SCALE or any Linux server using Docker.

## Prerequisites

- Docker 24+ and Docker Compose v2
- At least 512MB RAM
- 2GB disk space (more for receipt storage)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/budget-app.git
cd budget-app
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET`:

```bash
# Generate a secure secret
openssl rand -base64 48
```

Paste the output as the value of `JWT_SECRET` in `.env`.

### 3. Build and start

```bash
docker compose up -d --build
```

The app will be available at `http://your-server-ip:3000`.

### 4. Initial setup

Open your browser and navigate to `http://your-server-ip:3000`. You'll be guided through the setup wizard to:

1. Create your admin account
2. Name your first budget
3. Configure income sources
4. Set savings goals (optional)
5. Configure an AI provider for receipt scanning (optional)
6. Set up SMTP email for notifications (optional)

---

## TrueNAS SCALE Setup

### Using TrueCharts / Custom App

1. In TrueNAS SCALE, go to **Apps → Discover Apps → Custom App**
2. Set the repository to your GitHub URL or use the pre-built image
3. Configure volumes:
   - **Data volume**: Map `/data` to a dataset (e.g., `tank/budget/data`)
   - **Uploads volume**: Map `/uploads` to a dataset (e.g., `tank/budget/uploads`)
4. Set environment variables from `.env.example`
5. Expose port 3000

### Recommended dataset structure

```
tank/
└── budget/
    ├── data/        ← SQLite database lives here
    └── uploads/     ← Receipt images stored here
```

Create the datasets in TrueNAS before starting the app:

```bash
zfs create tank/budget/data
zfs create tank/budget/uploads
```

### Backup

Back up these two directories:
- `/data` — contains your SQLite database (all budget data)
- `/uploads` — contains uploaded receipt images

A simple cron backup:

```bash
# Daily backup to another location
0 2 * * * tar -czf /mnt/backup/budget-$(date +%Y%m%d).tar.gz /mnt/tank/budget/
```

---

## Updates

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on startup.

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | Secret for signing session tokens (≥32 chars) | **Yes** |
| `DATABASE_URL` | SQLite database path (`file:/data/budget.db`) | **Yes** |
| `UPLOAD_DIR` | Directory for receipt uploads | **Yes** |
| `PORT` | Internal port (default: 3000) | No |
| `HOST_PORT` | External port on your host (default: 3000) | No |

---

## Ports

| Port | Description |
|------|-------------|
| 3000 | Budget App (HTTP) |

For HTTPS, place a reverse proxy (Nginx, Traefik, Caddy) in front of the app.

---

## Troubleshooting

### App won't start

Check logs:
```bash
docker compose logs -f budget
```

Common issues:
- `JWT_SECRET` is missing or too short → generate one with `openssl rand -base64 48`
- `DATABASE_URL` path not writable → check volume permissions
- Port 3000 already in use → change `HOST_PORT` in `.env`

### Database issues

To reset the database (⚠️ **deletes all data**):
```bash
docker compose down
docker volume rm budget-app_budget_data
docker compose up -d
```

### Reset admin password

If you lose your admin password:
```bash
docker compose exec budget node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
bcrypt.hash('newpassword123', 12).then(h => 
  db.user.updateMany({ where: { role: 'ADMIN' }, data: { passwordHash: h } })
).then(() => { console.log('Done'); process.exit(0); });
"
```

---

## Security Notes

- Always use HTTPS in production — place behind Nginx/Traefik with Let's Encrypt
- The SQLite database file contains all financial data — protect it with proper filesystem permissions
- API keys (AI providers) are stored in the database — ensure the data volume is not publicly accessible
- Rotate `JWT_SECRET` to invalidate all existing sessions

---

## AI Providers

For receipt scanning, configure one of:

| Provider | Notes |
|----------|-------|
| **OpenAI** | GPT-4o recommended for best accuracy |
| **Anthropic** | Claude 3.5 Sonnet works well |
| **Google Gemini** | Good value with Gemini Flash |
| **Ollama** | 100% local — Llama 3.2 or Mistral |
| **Custom** | Any OpenAI-compatible API endpoint |

For fully offline operation, use Ollama running on the same host:
- `baseUrl`: `http://host.docker.internal:11434` (from inside Docker)
- Or use Docker networking and set the Ollama service URL accordingly
