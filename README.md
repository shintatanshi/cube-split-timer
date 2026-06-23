# Cube Split Timer

Rubik's Cube timer and training app built with React, Vite, and TypeScript.

Current public-ready scope:

- Timer
- Cross Analyzer foundation
- F2L Analyzer foundation
- Learn pages
- PWA foundation
- Supabase connection and solve session save helpers
- Supabase email login, admin page, role management, and password reset emails
- Vercel deployment configuration

Some analyzer and learning features are still in progress. The app can be published now, then updated later by pushing new commits to GitHub.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

The production output is generated in `dist/`.

## Environment Variables

Create `.env.local` from `.env.example`.

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Never commit `.env.local` or a Supabase `service_role` key.

## Deploy

See [DEPLOY.md](./DEPLOY.md) for the full GitHub, Supabase, and Vercel setup guide.
