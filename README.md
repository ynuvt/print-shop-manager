# PrintOwl (Turborepo)

PrintOwl is a multi‑package, multi‑app turborepo for managing student print jobs. It includes a React web UI, an Electron desktop app, a Socket.io notification service, and an Express API backed by PostgreSQL + Prisma and Cloudflare R2 storage.

---

## 🚀 Quick Start (Turborepo Setup)

> These steps assume you are on macOS (as per your environment info), have [Node.js](https://nodejs.org/) installed (recommended 18+), and are running from the repo root (`printowl`).

1. **Install dependencies**

```sh
# from the repository root
npm install
```

2. **Bootstrap the monorepo**

Turborepo uses task pipelines; run dev mode to start everything together.

```sh
npm run dev
```

3. **Run a single app**

- **API** (backend):

  ```sh
  npm run dev -- --filter=api
  ```

- **Web** (student-facing UI):

  ```sh
  npm run dev -- --filter=web
  ```

- **Electron** (desktop app):

  ```sh
  npm run dev -- --filter=electron
  ```

- **WebSocket** (notification service):
  ```sh
  npm run dev -- --filter=websocket
  ```

> Tip: Use `-- --filter=<name>` so Turbo only runs the package you care about.

---

## 🧩 Repo Structure

```
/apps
  /api        # Express backend (jobs, auth, R2 upload, socket notifications)
  /electron   # Electron desktop UI (print operator app)
  /web        # Web UI (student web experience)
  /websocket  # Socket.io server used for realtime job updates
/packages
  /db         # Prisma client + database schema
  /eslint-config
  /shared-utils
  /types
/types
/public
```

---

## 🏗 Architecture (How it works)

### Key components

- **Student (React web)**: uploads a PDF, picks print options, and creates a print job.
- **Backend (Express API)**: stores jobs in PostgreSQL, uploads files to Cloudflare R2, and updates status.
- **WebSocket server (Socket.io)**: emits job status changes in real time to the student UI and print operator.
- **Print Operator (Electron app)**: polls/receives new job events, marks jobs as processed, and updates status.
- **Cloudflare R2**: hosts uploaded PDF files; backend generates a public URL for students to download.

### Data flow (high level)

1. Student submits a print job via the web UI.
2. The backend receives the file, stores metadata in Postgres, uploads the file to Cloudflare R2, and creates a `job` record.
3. The backend emits an update on the WebSocket channel.
4. The print operator app receives the update and can mark the job as printed (or rejected).
5. The backend updates job status; the student UI receives the update via WebSocket.

### Architecture diagram

![PrintOwl architecture and user flow](public/Architecture%20and%20UserFlow.png)

---

## 🧭 User Flow

1. **Pending** – student uploads a PDF and selects print options.
2. **Processing** – backend uploads file to R2 and persists the job.
3. **Completed** – print operator confirms the print job is done (or rejects it).

> When completed, the backend may clean up temporary files and updates the job status so the student sees the final state.

---

## ⚙️ Environment Configuration (env vars)

Each app/package that needs configuration uses `.env` files in its folder. The most important vars are:

### API (`apps/api/.env`)

- `PORT` – port the backend listens on (default: 4000)
- `DATABASE_URL` – Postgres connection string (used by Prisma)
- `R2_BUCKET_NAME` – Cloudflare R2 bucket name
- `R2_ACCOUNT_ID` – Cloudflare account ID
- `R2_ACCESS_KEY_ID` – Cloudflare R2 access key
- `R2_SECRET_ACCESS_KEY` – Cloudflare R2 secret key
- `R2_PUBLIC_BUCKET_URL` – Public URL of your R2 bucket (e.g. `https://<bucket>.<account>.r2.cloudflarestorage.com`)
- `socket_url` – URL of the Socket.io server (used by the web UI)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` – credentials for the print operator auth

> You can copy the example `.env.example` (if present) or create your own at `apps/api/.env`.

---

## 🧪 Local Development Notes

- The API uses Prisma; run migrations when the schema changes:

  ```sh
  npx prisma migrate dev --schema=packages/db/prisma/schema.prisma
  ```

- Web + Electron apps use Vite.

---

## 📚 Further Reading

- [Turborepo docs](https://turborepo.dev)
- [Prisma docs](https://www.prisma.io/docs)
- [Cloudflare R2 docs](https://developers.cloudflare.com/r2/)
- [Socket.io docs](https://socket.io/docs/)
