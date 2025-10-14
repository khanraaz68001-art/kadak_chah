# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/178dbc1d-9ac4-4ac8-b860-97e2156c0069

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/178dbc1d-9ac4-4ac8-b860-97e2156c0069) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/178dbc1d-9ac4-4ac8-b860-97e2156c0069) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

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

Once the env vars are set, the app will initialize a Supabase client at runtime and you can replace the mock data with real queries.

