# AI-Powered SME Loan Underwriting Platform

A production-ready **monorepo** for an AI-powered SME loan underwriting platform built with React, Express.js, PostgreSQL, PaddleOCR, and LLMs.

---

## 📁 Project Structure

```
AI_LOAN_AG/
├── frontend/          # React + Vite + Tailwind + shadcn/ui
├── backend/           # Express.js + MongoDB + JWT RBAC
├── ai-services/       # Python FastAPI + pgvector + PaddleOCR
├── docker-compose.yml # Full stack orchestration
├── .env.example       # Root environment template
├── .eslintrc.js       # Shared ESLint config
├── .prettierrc        # Shared Prettier config
└── package.json       # npm workspaces root
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9
- Docker + Docker Compose (for full stack)
- Ollama (for local LLM)

### 1. Clone & Install
```bash
git clone <repo-url>
cd AI_LOAN_AG
npm install   # installs all workspace packages
```

### 2. Configure Environment
```bash
cp .env.example backend/.env
cp .env.example ai-services/.env
cp .env.example frontend/.env
# Edit each .env with your actual values
```

### 3. Run with Docker
```bash
docker-compose up --build
```

### 4. Run Locally (Dev)
```bash
# Terminal 1 — Backend
npm run dev:backend

# Terminal 2 — AI Services
npm run dev:ai

# Terminal 3 — Frontend
npm run dev:frontend
```

---

## 🏗️ Architecture

### Backend (`/backend`)
| Layer | Purpose |
|---|---|
| `controllers/` | Thin HTTP handlers — delegate to services |
| `routes/v1/` | Versioned route definitions |
| `middleware/` | Auth (JWT+RBAC), error handling, rate limiting, logging |
| `services/` | Business logic |
| `repositories/` | MongoDB/Mongoose data access layer |
| `validators/` | Zod request validation schemas |
| `utils/` | ApiError, ApiResponse, asyncHandler, logger |
| `config/` | DB, Cloudinary, environment config |

### AI Services (`/ai-services`)
| Layer | Purpose |
|---|---|
| `services/llm/` | Ollama REST API client |
| `services/ocr/` | PaddleOCR document processing |
| `services/vectorDb/` | PostgreSQL pgvector storage & retrieval |
| `services/embeddings/` | Text embedding generation |

### Frontend (`/frontend`)
| Layer | Purpose |
|---|---|
| `components/ui/` | shadcn/ui component library |
| `api/` | Axios API client layer |
| `hooks/` | Custom React hooks |
| `context/` | Auth and Theme context |
| `pages/` | Route-level page components |
| `store/` | Global state management |

---

## 🔐 Authentication

JWT-based authentication with Role-Based Access Control (RBAC).

**Roles:** `admin`, `underwriter`, `analyst`, `applicant`

---

## 🐳 Services & Ports

| Service | Port |
|---|---|
| Frontend | 3000 |
| Backend API | 5000 |
| AI Services | 5001 |
| PostgreSQL | 5432 |
| Ollama | 11434 |

---

## 🛠️ Tooling

- **ESLint** — `eslint:recommended` + import plugin
- **Prettier** — single quotes, 2 spaces, trailing commas
- **Winston** — structured JSON logging with daily rotation
- **Morgan** — HTTP access log middleware
- **Zod** — runtime environment & request validation
- **Helmet** — security headers
- **express-rate-limit** — API rate limiting

---

## 📦 Tech Stack

| Component | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend | Express.js, Mongoose |
| Database | PostgreSQL |
| Vector DB | pgvector |
| OCR | PaddleOCR |
| LLM Runtime | Ollama |
| File Storage | Cloudinary |
| Auth | JWT + RBAC |
| Container | Docker + Docker Compose |
