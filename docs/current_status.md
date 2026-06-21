# Cube Split Timer current status

Last updated: 2026-06-22

This file is the handoff note for using the same project from multiple PCs with Codex.
When starting work on another PC, ask Codex to read this file and `AGENTS.md` first.

## Current branch

- Branch: `main`
- Remote source of truth: GitHub `origin/main`

## Recent important commits

- `a6db734` Add local history migration tools
- `90043f2` Add Vercel SPA routing config
- `7fb7cb5` Add Supabase email login
- `7a81550` Move analyzer player above mobile analysis
- `886b49a` Improve analyzer last layer playback

## Current app state

- React + Vite + TypeScript app.
- Supabase email login is implemented.
- Local solve history can be migrated/imported so old device data can be moved into a logged-in account.
- Admin access is implemented with an `/admin` page, admin-only RLS, profile emails, cloud history visibility, role changes, password reset email support, and a profile backfill migration for existing Auth users. Passwords are never exposed in plaintext.
- Analyzer has Cross / F2L / OLL / PLL playback improvements.
- Analyzer mobile layout was adjusted so the animation appears above the analysis blocks on phone layouts.
- Vercel SPA routing config is present.

## Environment variables

Create `.env.local` on each PC. Do not commit it.

Required keys:

```text
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

Never put a Supabase `service_role` key in frontend code, `.env.local`, Vercel client env, or GitHub.

## First setup on another PC

```powershell
git clone https://github.com/shintatanshi/cube-split-timer.git
cd cube-split-timer
npm install
Copy-Item .env.example .env.local
npm run dev
```

Then fill `.env.local` with the Supabase URL and publishable/anon key.

## Start-of-work checklist

```powershell
git status
git pull origin main
npm install
npm run dev
```

`npm install` is especially important when `package.json` or `package-lock.json` changed.

## End-of-work checklist

```powershell
npm run build
git status
git add .
git commit -m "Describe the change"
git push origin main
```

If there are unrelated local files, stage only the files that belong to the finished work.

## Codex handoff prompt

Use this prompt on the other PC:

```text
AGENTS.md と docs/current_status.md を読んで、前回の続きから作業してください。
```

## Do not sync directly

Do not blindly copy or cloud-sync the whole `C:\Users\sinta\.codex` folder between PCs.
It can contain login/session data, caches, attachments, plugin files, and PC-specific state.

Safe things to sync through Git:

- `AGENTS.md`
- `docs/current_status.md`
- Source code
- Non-secret documentation

Keep secrets and local-only values per PC.
