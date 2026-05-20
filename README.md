# AI-Powered Expense Tracker

A full-stack, AI-powered Expense Tracker built with Python (FastAPI), vanilla HTML/JS/CSS, and Anthropic's Claude API.

## Features
- **Dashboard**: View, filter, and delete expenses.
- **Manual Entry**: Add expenses manually via a form.
- **AI Bill Upload**: Upload a receipt or bill (image or PDF) and let Claude automatically extract the merchant, amount, date, line items, and suggest a category.
- **Export**: Download all expenses as a CSV file.

## Tech Stack
- **Backend**: FastAPI (Python)
- **Frontend**: Vanilla JS, HTML, CSS (Custom dynamic design)
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`)
- **Database**: Local JSON file (`/tmp/expenses.json` on Vercel)

## Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set your Anthropic API key:
```bash
# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key-here"

# Mac/Linux
export ANTHROPIC_API_KEY="your-api-key-here"
```

3. Run the development server:
```bash
uvicorn api.index:app --reload
```

4. Open your browser and navigate to `http://localhost:8000`.

## Deployment to Vercel

1. Make sure you have the Vercel CLI installed: `npm i -g vercel`.
2. Run `vercel` to link and deploy your project.
3. Add the `ANTHROPIC_API_KEY` to your Vercel project's Environment Variables via the Vercel dashboard.
4. Redeploy or run `vercel --prod`.
