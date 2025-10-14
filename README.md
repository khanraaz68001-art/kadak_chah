# Kadak चाह — Chronicle Hub

Kadak चाह is our premium tea experience—a bold brew with a warm, letter-style personality that infuses every customer touchpoint. This repository keeps the brand’s digital presence cohesive so partners, admins, and customers interact with the same comforting story in every flow.

## About the brand

- **Purpose:** Celebrate everyday tea rituals with a luxurious, handcrafted feel.
- **Voice:** Friendly, refined, and steeped in hospitality—each interaction should feel like sharing a favourite cup with a trusted host.
- **Focus:** Equip partners with smart tools (analytics, reminders, exports) while spotlighting the Kadak चाह identity.

## Working with this repository

### Edit locally and push to GitHub

```powershell
# Clone once (if you haven't already)
git clone https://github.com/khanraaz68001-art/kadak_chah.git
cd kadak_chah

# Check what changed after your edits
git status

# Stage the files you touched
git add README.md

# Commit with a meaningful message
git commit -m "docs: refresh brand story"

# Push the branch to GitHub
git push origin main
```

Made another tweak? Repeat the last three commands (`git status`, `git add`, `git commit`, `git push`). Collaborating with someone else? Pull the latest updates first:

```powershell
git pull origin main
```

### Prefer editing online?

- Use the GitHub web editor: open the file, click the pencil icon, edit, and commit.
- Launch a Codespace from the **Code** button for a cloud IDE that’s preconfigured for React + Vite.

## Development quickstart

This app uses Vite, React, TypeScript, Tailwind CSS, and shadcn-ui. Make sure Node.js and npm are installed (we recommend [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
# Install dependencies
npm i

# Start the dev server with hot reloading
npm run dev

# Optional checks before committing
npm run lint
npm run build
```

## What technologies are used for this project?

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase (optional backend)

## Deployment

Deploy to any static host that supports Vite builds (Netlify, Vercel, Cloudflare Pages, etc.). Run `npm run build` and upload the `dist/` folder. If you prefer Lovable’s workflow, open the [Lovable project dashboard](https://lovable.dev/projects/178dbc1d-9ac4-4ac8-b860-97e2156c0069) and publish from there.

## Supabase integration (local dev)

This project can connect to Supabase to make the app dynamic. Steps:

1. Create a Supabase project at https://supabase.com and open the "API" section to copy the project URL and anon key.
2. Create a `.env` file at the project root (this is excluded from git) and set:

```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. Run:

```
npm i
npm run dev
```

Suggested minimal table schemas (run in Supabase SQL editor):

```sql
-- customers
CREATE TABLE customers (
    id uuid primary key default gen_random_uuid(),
    full_name text,
    shop_name text,
    address text,
    contact text,
    created_at timestamp with time zone default now()
);

-- transactions
CREATE TABLE transactions (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references customers(id) on delete set null,
    amount numeric,
    type text,
    created_at timestamp with time zone default now()
);
```

Once the env vars are set, the app will initialize a Supabase client at runtime and you can replace the mock data with real queries.

