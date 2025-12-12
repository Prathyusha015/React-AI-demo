# OpenRouter Setup Guide

## Quick Start

### Step 1: Get Your OpenRouter API Key

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Sign up or log in
3. Create a new API key
4. Copy your API key (starts with `sk-or-v1-...`)

### Step 2: Add API Key to Environment Variables

Create or edit `.env.local` in your project root:

```bash
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
```

**Important:** 
- The `.env.local` file is for local development
- For production, add this to your hosting platform's environment variables (Vercel, Netlify, etc.)
- Never commit `.env.local` to git (it's already in `.gitignore`)

### Step 3: Restart Your Dev Server

After adding the environment variable, restart your Next.js dev server:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run dev
```

### Step 4: Configure in Settings Page

1. Open your app: `http://localhost:3000`
2. Navigate to **Settings** (`/settings`)
3. Select **OpenRouter API** as your provider
4. Choose a model from the dropdown (e.g., GPT-3.5 Turbo, GPT-4, Claude, etc.)
5. Click **🧪 Test Connection** to verify it works
6. Click **💾 Save Settings**

### Step 5: Upload Files

1. Go to **Upload** page (`/upload`)
2. Select files to upload
3. Click **🚀 Upload & Analyze**
4. Files will be processed using OpenRouter API (if selected in Settings)

## How It Works

### Automatic Provider Selection

The app uses the provider you selected in Settings:
- **On-Device LLM**: Uses `@xenova/transformers` (free, slower)
- **OpenRouter**: Uses cloud API (faster, pay-per-use)

### Where OpenRouter is Used

1. **Text/PDF Summarization**: When processing `.txt` or `.pdf` files
2. **File Reprocessing**: When you click "Regenerate" on a file
3. **Settings Test**: When you test the connection

### Supported Models

You can choose from these models in Settings:
- `openai/gpt-3.5-turbo` - Fast & Cheap (default)
- `openai/gpt-4-turbo` - Best Quality
- `anthropic/claude-3-haiku` - Fast Claude
- `anthropic/claude-3-sonnet` - Balanced Claude
- `google/gemini-pro` - Google's model
- `meta-llama/llama-3-8b-instruct` - Open Source

## Troubleshooting

### "OpenRouter API key not configured"

**Solution:** Make sure:
1. `.env.local` exists in project root
2. `OPENROUTER_API_KEY=sk-or-v1-...` is set
3. Dev server was restarted after adding the key
4. No typos in the key

### "Failed to call OpenRouter API"

**Possible causes:**
1. Invalid API key - check it's correct
2. Insufficient credits - add credits to your OpenRouter account
3. Network issue - check your internet connection
4. Model unavailable - try a different model

### Settings page shows API key field

**Note:** The API key input in Settings page is for reference only. The actual key must be set in `.env.local` for server-side processing to work.

## Cost Information

- OpenRouter charges per token usage
- Different models have different costs
- Check [openrouter.ai/models](https://openrouter.ai/models) for pricing
- GPT-3.5 Turbo is the cheapest option (~$0.50 per 1M tokens)

## Fallback Behavior

If OpenRouter fails:
- The app automatically falls back to on-device LLM
- You'll see a warning in the console
- Files will still be processed (just slower)

## Production Deployment

When deploying to production (Vercel, Netlify, etc.):

1. Go to your hosting platform's dashboard
2. Navigate to Environment Variables settings
3. Add: `OPENROUTER_API_KEY` = `sk-or-v1-your-key`
4. Redeploy your application

The app will automatically use the production environment variable.






