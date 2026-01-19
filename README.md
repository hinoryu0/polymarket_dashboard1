# Polymarket Inefficiency Dashboard

A Next.js-based dashboard that displays live Polymarket market data, designed to work reliably even when Polymarket is blocked locally by fetching data from Supabase.

## Features

- Real-time market data from Polymarket
- Works even if Polymarket is blocked (data fetched via cloud)
- Displays market title, yes price, and trading volume
- Auto-refresh capability
- Responsive UI with TailwindCSS
- TypeScript for type safety
- Automated data sync via GitHub Actions

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Data Sync**: GitHub Actions (scheduled every 5 minutes)

## Architecture

```
┌─────────────────┐
│  User Browser   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│   Next.js App   │──────│  /api/markets    │
│   (Frontend)    │      │  (API Route)     │
└─────────────────┘      └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │    Supabase      │
                         │   (PostgreSQL)   │
                         └────────▲─────────┘
                                  │
                         ┌────────┴─────────┐
                         │  GitHub Actions  │
                         │  (Data Ingestion)│
                         └────────▲─────────┘
                                  │
                         ┌────────┴─────────┐
                         │   Gamma API      │
                         │  (Polymarket)    │
                         └──────────────────┘
```

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Wait for the project to finish setting up
4. Go to **Project Settings** → **API** and copy:
   - Project URL (your `SUPABASE_URL`)
   - `anon` `public` key (your `SUPABASE_ANON_KEY`)
   - `service_role` `secret` key (your `SUPABASE_SERVICE_ROLE_KEY`)

### 2. Create Database Table

1. In your Supabase project, go to **SQL Editor**
2. Run the SQL from `supabase/schema.sql`:

```sql
-- Copy and paste the contents of supabase/schema.sql
```

This will create:
- `markets` table with columns: `id`, `title`, `url`, `yes_price`, `volume_usd`, `updated_at`
- Index on `updated_at` for efficient queries
- Auto-update trigger for `updated_at`

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**IMPORTANT**: Never commit `.env.local` to git. The `.gitignore` file already excludes it.

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Initial Data Ingestion (Optional)

Before starting the app, you can populate the database with market data:

```bash
# Set environment variables for the script
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Run the ingestion script
npm run fetch-markets
```

This fetches markets from Polymarket's Gamma API and stores them in Supabase.

### 6. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 7. Test the Application

1. **Test the frontend**: Open [http://localhost:3000](http://localhost:3000)
   - You should see the dashboard with markets (if data was ingested)
   - Click "Refresh" to refetch data
   - Click "Open" to view a market on Polymarket

2. **Test the API**: Open [http://localhost:3000/api/markets](http://localhost:3000/api/markets)
   - You should see JSON with market data
   - Response format:
     ```json
     {
       "success": true,
       "count": 10,
       "markets": [
         {
           "id": "...",
           "title": "...",
           "url": "...",
           "yesPrice": 0.65,
           "volumeUsd": 123456
         }
       ]
     }
     ```

## GitHub Actions Setup (Automated Data Sync)

To enable automatic data syncing every 5 minutes:

### 1. Add Repository Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add the following secrets:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (NOT the anon key)

### 2. Enable GitHub Actions

The workflow file `.github/workflows/polymarket-sync.yml` is already configured to:
- Run every 5 minutes (cron: `*/5 * * * *`)
- Support manual dispatch (you can trigger it manually from GitHub UI)

### 3. Monitor the Workflow

- Go to **Actions** tab in your GitHub repository
- Check the "Polymarket Data Sync" workflow
- You should see it running every 5 minutes
- Click on any run to see logs

## Project Structure

```
polymarket_dashboard1/
├── .github/
│   └── workflows/
│       └── polymarket-sync.yml    # GitHub Actions workflow
├── scripts/
│   └── fetch-markets.ts           # Data ingestion script
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── markets/
│   │   │       └── route.ts       # API endpoint
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Dashboard page
│   │   └── globals.css            # Global styles
│   └── lib/
│       └── providers/
│           ├── types.ts           # Type definitions
│           ├── supabase.ts        # Supabase provider
│           └── index.ts           # Provider exports
├── supabase/
│   └── schema.sql                 # Database schema
├── .env.example                   # Example environment variables
├── .gitignore                     # Git ignore rules
├── next.config.js                 # Next.js configuration
├── package.json                   # Dependencies
├── postcss.config.js              # PostCSS configuration
├── tailwind.config.ts             # Tailwind configuration
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

## Environment Variables

### For Local Development (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### For GitHub Actions (Repository Secrets)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Security Notes**:
- Use `SUPABASE_ANON_KEY` for frontend (it's safe to expose)
- Use `SUPABASE_SERVICE_ROLE_KEY` only in server-side code (GitHub Actions, API routes with server-only imports)
- Never commit `.env.local` or expose service role key in frontend code

## API Endpoints

### GET /api/markets

Fetches markets from Supabase database.

**Query Parameters**:
- `limit` (optional): Number of markets to return (1-100, default: 10)

**Response**:
```json
{
  "success": true,
  "count": 10,
  "markets": [
    {
      "id": "market-id",
      "title": "Will X happen by Y?",
      "url": "https://polymarket.com/event/...",
      "yesPrice": 0.65,
      "volumeUsd": 123456.78
    }
  ]
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Error message",
  "markets": []
}
```

## Troubleshooting

### No markets showing on dashboard

1. Check if data exists in Supabase:
   - Go to Supabase → **Table Editor** → `markets` table
   - If empty, run the ingestion script: `npm run fetch-markets`

2. Check browser console for errors
3. Check API response: [http://localhost:3000/api/markets](http://localhost:3000/api/markets)

### Data ingestion script fails

1. Verify environment variables are set:
   ```bash
   echo $SUPABASE_URL
   echo $SUPABASE_SERVICE_ROLE_KEY
   ```

2. Check Gamma API is accessible:
   ```bash
   curl https://gamma-api.polymarket.com/markets
   ```

3. Check Supabase credentials are correct

### GitHub Actions failing

1. Verify repository secrets are set correctly
2. Check workflow logs in GitHub Actions tab
3. Ensure `package.json` has correct script: `"fetch-markets": "tsx scripts/fetch-markets.ts"`

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm build

# Start production server
npm start

# Run data ingestion script
npm run fetch-markets

# Type checking
npx tsc --noEmit
```

## License

MIT

## Contributing

Pull requests are welcome! Please ensure all code passes TypeScript checks and follows the existing code style.
