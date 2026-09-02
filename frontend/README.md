# DocVerify AI Frontend Console

This is the React + Vite + TypeScript + Tailwind CSS client console for the Document Onboarding backend service.

## Prerequisites

Ensure you have **Node.js** (v18 or higher) and **npm** installed.

## Getting Started

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Configure Environment Variables:**
   Rename `.env.example` to `.env` and set the backend API location:
   ```bash
   cp .env.example .env
   ```
   Modify `VITE_API_BASE_URL` in `.env` if your backend port changes (defaults to `http://localhost:8000`).

3. **Install Dependencies:**
   ```bash
   npm install
   ```

4. **Launch Local Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your web browser.

5. **Build for Production:**
   ```bash
   npm run build
   ```
   The compiled static folder is created in `dist/`.
