import os
import json
import uuid
import base64
import csv
import io
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, File, UploadFile, Request, HTTPException, Form
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from anthropic import Anthropic
import pydantic
from dotenv import load_dotenv

# Load environment variables from .env file (if it exists)
load_dotenv()

app = FastAPI(title="Expense Tracker API")

# Setup directories for static files and templates
current_dir = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(current_dir) == "api":
    BASE_DIR = os.path.dirname(current_dir)
else:
    BASE_DIR = current_dir

STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

startup_error = None
try:
    if os.path.exists(STATIC_DIR):
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    templates = Jinja2Templates(directory=TEMPLATES_DIR)
except Exception as e:
    startup_error = str(e)
    templates = None

@app.get("/debug")
def debug_info():
    return {
        "file": __file__,
        "cwd": os.getcwd(),
        "BASE_DIR": BASE_DIR,
        "STATIC_DIR": STATIC_DIR,
        "static_exists": os.path.exists(STATIC_DIR),
        "TEMPLATES_DIR": TEMPLATES_DIR,
        "templates_exists": os.path.exists(TEMPLATES_DIR),
        "startup_error": startup_error
    }

# Setup Storage - Vercel only allows writing to /tmp
DATA_FILE = os.path.join(BASE_DIR, "data", "expenses.json")
TMP_DATA_FILE = "/tmp/expenses.json"

def get_data_file_path() -> str:
    # If we are on Vercel (or linux usually), use /tmp if possible, else fallback to local
    if os.environ.get("VERCEL") or sys.platform != "win32": # basic heuristic
        # Ensure it exists in tmp
        if not os.path.exists(TMP_DATA_FILE):
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, "r") as src, open(TMP_DATA_FILE, "w") as dst:
                    dst.write(src.read())
            else:
                with open(TMP_DATA_FILE, "w") as f:
                    json.dump([], f)
        return TMP_DATA_FILE
    else:
        # Local development on Windows
        if not os.path.exists(DATA_FILE):
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            with open(DATA_FILE, "w") as f:
                json.dump([], f)
        return DATA_FILE

import sys

def load_expenses() -> List[Dict]:
    path = get_data_file_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_expenses(expenses: List[Dict]):
    path = get_data_file_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(expenses, f, indent=2)

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/upload", response_class=HTMLResponse)
async def upload_page(request: Request):
    return templates.TemplateResponse(request=request, name="upload.html")

@app.get("/api/expenses")
async def get_expenses():
    return load_expenses()

class ExpenseModel(pydantic.BaseModel):
    amount: float
    merchant: str
    category: str
    date: str
    notes: Optional[str] = ""
    items: Optional[List[Dict[str, Any]]] = []

@app.post("/api/add")
async def add_expense(expense: ExpenseModel):
    expenses = load_expenses()
    new_expense = {
        "id": str(uuid.uuid4()),
        "merchant": expense.merchant,
        "amount": expense.amount,
        "date": expense.date,
        "category": expense.category,
        "notes": expense.notes,
        "items": expense.items,
        "created_at": datetime.now().isoformat()
    }
    expenses.append(new_expense)
    # Sort by date descending
    expenses.sort(key=lambda x: x['date'], reverse=True)
    save_expenses(expenses)
    return {"status": "success", "expense": new_expense}

@app.post("/api/upload")
async def upload_receipt(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(None)
):
    # Validate file
    if not file.content_type.startswith("image/") and file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only images and PDFs are supported.")
    
    contents = await file.read()
    b64_content = base64.b64encode(contents).decode("utf-8")
    
    # Identify media type for Anthropic
    media_type = file.content_type
    
    # Initialize Anthropic client
    active_api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not active_api_key:
        raise HTTPException(status_code=400, detail="API Key not found. Please add your Anthropic API Key in Settings.")
    
    client = Anthropic(api_key=active_api_key)
    
    prompt = (
        "You are an expense extraction assistant. Analyze the uploaded bill or receipt image "
        "and extract: merchant name, total amount, date, individual line items, and suggest a category "
        "from: Food, Transport, Shopping, Utilities, Health, Entertainment, Other. "
        "Return ONLY a JSON object with keys: merchant, amount (as a number), date (YYYY-MM-DD format), "
        "category, items (array of objects with name, amount), notes (brief summary)."
    )
    
    try:
        if file.content_type == "application/pdf":
            # Claude currently supports PDFs in beta or through specific document blocks
            # For this exact specification, we will try to pass it as document if supported
            # Anthropic Claude 3.5 Sonnet supports PDF directly via DocumentBlock
             message = client.messages.create(
                model="claude-3-5-sonnet-20240620", # using latest available standard for document extraction if specified fails
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": b64_content
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            )
        else:
            message = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": b64_content
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            )
            
        result_text = message.content[0].text
        
        # Claude might wrap JSON in markdown blocks
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0].strip()
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0].strip()
            
        parsed_json = json.loads(result_text)
        return parsed_json
        
    except Exception as e:
        print("Anthropic API Error:", str(e))
        raise HTTPException(status_code=500, detail=f"Failed to process receipt: {str(e)}")


@app.delete("/api/expense/{expense_id}")
async def delete_expense(expense_id: str):
    expenses = load_expenses()
    initial_length = len(expenses)
    expenses = [e for e in expenses if e.get("id") != expense_id]
    
    if len(expenses) == initial_length:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    save_expenses(expenses)
    return {"status": "success"}

@app.get("/api/export")
async def export_csv():
    expenses = load_expenses()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Date", "Merchant", "Category", "Amount", "Notes"])
    
    for e in expenses:
        writer.writerow([
            e.get("id", ""),
            e.get("date", ""),
            e.get("merchant", ""),
            e.get("category", ""),
            e.get("amount", 0),
            e.get("notes", "")
        ])
        
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses.csv"}
    )
