# CampusFlow

CampusFlow is an academic resource-sharing and classroom collaboration platform built with React 19, TypeScript, Vite, Tailwind CSS v4, and Supabase.

## Vercel Production Deployment Guide

Follow these steps to deploy CampusFlow to Vercel:

### 1. Import Repository
1. Log in to [Vercel](https://vercel.com/) and navigate to your dashboard.
2. Click **Add New...** > **Project**.
3. Import the GitHub repository containing the CampusFlow application.

### 2. Configure Framework and Root Directory
1. **Framework Preset**: Select **Vite** (Vercel automatically detects Vite configurations).
2. **Root Directory**: Click **Edit** and set the root directory to `CampusFlow Web Application Design` (the project directory containing `package.json` and `vite.config.ts`).

### 3. Build & Output Settings
- **Build Command**: `npm run build` (or `vite build`)
- **Output Directory**: `dist`
- **Install Command**: `npm install`

*Note: SPA client-side routing and page refresh rewrites are pre-configured in `vercel.json`.*

### 4. Configure Environment Variables
In the **Environment Variables** section of the Vercel project configuration, add your Supabase client credentials:

| Variable Name | Description | Example Placeholder |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Public HTTPS URL of your Supabase project | `https://your-project-ref.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public client/anon API key | `your-supabase-publishable-key` |

*(Optional legacy fallback: `VITE_SUPABASE_ANON_KEY` is also supported if publishable key is not set).*

> **SECURITY NOTICE**:
> - Never expose a Supabase `service_role` key in Vercel client environment variables or frontend code.
> - Only browser-safe public/anon publishable keys should be configured. All authorization is enforced at the database layer via Row Level Security (RLS) policies and security definer functions.
> - `.env` and `.env.local` files are excluded from Git via `.gitignore`.

### 5. Deploy and Verification
1. Click **Deploy**.
2. Once the deployment finishes, open your production URL.
3. Verify that:
   - Direct navigation to `/`, `/login`, `/dashboard`, `/browse`, `/classroom` loads without 404 errors.
   - User signup and login communicate securely with Supabase Auth.
   - Refreshing an authenticated page seamlessly restores the user session from tab session storage.
   - Unauthenticated direct navigation to protected views redirects cleanly to `/login`.

---

## Local Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Type check
npx tsc --noEmit

# Production build
npm run build
```
