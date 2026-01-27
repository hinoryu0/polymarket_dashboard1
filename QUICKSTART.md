# 🚀 Quick Start Guide

Get your Polymarket Dashboard running in 10 minutes!

---

## Prerequisites

- GitHub account
- Supabase account (free tier works)
- Vercel account (optional, for deployment)

---

## Step 1: Set Up Supabase (3 minutes)

### 1.1 Create Project
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Fill in:
   - **Name:** polymarket-dashboard
   - **Database Password:** (generate strong password)
   - **Region:** Choose closest to you
4. Click "Create new project"
5. Wait ~2 minutes for setup to complete

### 1.2 Run Database Schema
1. In Supabase dashboard, click **SQL Editor**
2. Click "+ New Query"
3. Copy entire contents of `supabase/schema.sql` from this repo
4. Paste into SQL editor
5. Click "Run" (bottom right)
6. ✅ You should see "Success. No rows returned"

### 1.3 Get API Keys
1. Go to **Project Settings** (⚙️ icon)
2. Click **API** in sidebar
3. Copy these values (you'll need them):
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`  
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: Configure GitHub Secrets (2 minutes)

1. Go to your **GitHub repository**
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click "New repository secret" and add:

| Secret Name | Value |
|-------------|-------|
| `SUPABASE_URL` | https://xxx.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJhbGc... (service role key) |

4. Click "Add secret" for each

---

## Step 3: Run First Data Sync (1 minute)

1. Go to **Actions** tab in GitHub
2. Click "Polymarket Data Sync" workflow
3. Click "Run workflow" → "Run workflow"
4. Wait ~1 minute for workflow to complete
5. ✅ Check that workflow shows green checkmark

---

## Step 4: Deploy to Vercel (3 minutes)

### 4.1 Connect to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your GitHub repo
4. Click "Deploy"

### 4.2 Add Environment Variables
1. In Vercel project settings
2. Go to **Settings** → **Environment Variables**
3. Add these:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | https://xxx.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | eyJhbGc... (anon key) |

4. Click "Save"
5. Go to **Deployments** → Redeploy latest

---

## Step 5: Verify Everything Works (1 minute)

### 5.1 Check API Health
Open in browser:
```
https://your-app.vercel.app/api/health
```

✅ You should see:
```json
{
  "ok": true,
  "timestamp": "2026-01-27T...",
  "marketsTotal": 20000+,
  "marketsWithPrice": 14000+,
  "lastMarketUpdatedAt": "2026-01-27T..."
}
```

### 5.2 Check Dashboard
1. Open `https://your-app.vercel.app`
2. You should see:
   - ✅ Market list (top volume markets)
   - ✅ Price movers section (may be empty initially)
   - ✅ "Last updated: X min ago"

### 5.3 Wait for Movers
- Movers require **~1 hour of data** (12 snapshots for 1h window)
- GitHub Actions runs every **15 minutes**
- After 1-2 hours, movers will start appearing

---

## Troubleshooting

### "No markets found"
- ✅ Check GitHub Actions workflow succeeded
- ✅ Check Supabase `markets` table has data
- ✅ Manually trigger workflow: Actions → Run workflow

### "Not enough snapshot history"
- ⏳ Wait 1-2 hours for enough snapshots
- ✅ Check `price_snapshots` table is growing
- ✅ Check `movers_cache` table is populated

### "Failed to fetch markets"
- ✅ Check Vercel environment variables are set
- ✅ Check Supabase keys are correct
- ✅ Check `/api/health` endpoint works

### Workflow fails
- ✅ Check GitHub Secrets are set correctly
- ✅ Check Supabase is not overloaded (Free tier limits)
- ✅ Check workflow logs for specific error

---

## Next Steps

Once everything is working:

1. **Monitor Data Flow**
   - Check `/api/health` regularly
   - Verify snapshots growing in Supabase
   - Watch for movers appearing

2. **Customize Filters** (optional)
   - Edit `src/lib/categories/categorizeMarket.ts`
   - Adjust allowed categories
   - Enable/disable optional categories

3. **Tune Movers Parameters** (optional)
   - Edit `scripts/computeMoversCache.ts`
   - Adjust `MIN_CHANGE_PP` (default: 10pp)
   - Adjust volume thresholds
   - Adjust price range filters

4. **Set Up Monitoring** (optional)
   - Monitor GitHub Actions runs
   - Set up Supabase alerts
   - Track API usage

---

## Support

If you get stuck:
1. Check [README.md](README.md) for detailed docs
2. Check [Issues](../../issues) for known problems
3. Open new issue with error logs

---

**🎉 Congratulations! Your Polymarket Dashboard is now live!**

Dashboard URL: `https://your-app.vercel.app`

Give it 1-2 hours to accumulate data, then you'll start seeing movers! 🚀
