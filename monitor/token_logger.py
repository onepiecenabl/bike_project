import json
import os
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "token_data"
DATA_DIR.mkdir(exist_ok=True)
LOG_FILE = DATA_DIR / "token_log.jsonl"
STATS_FILE = DATA_DIR / "stats.json"

def log_task(task: str, input_tokens: int, output_tokens: int, cost: float = 0.0):
    # Update Log
    entry = {
        "timestamp": datetime.now().isoformat(),
        "task": task,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cost": cost,
        "status": "success"
    }
    
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        f.flush()

    # Update Stats (Simple append logic)
    if STATS_FILE.exists():
        with open(STATS_FILE) as f:
            stats = json.load(f)
    else:
        stats = {"total_input": 0, "total_output": 0, "total_cost": 0.0, "task_count": 0, "recent_tasks": []}

    stats["total_input"] += input_tokens
    stats["total_output"] += output_tokens
    stats["total_cost"] = round(stats.get("total_cost", 0) + cost, 6)
    stats["task_count"] += 1
    
    # Store last 10 tasks
    stats["recent_tasks"].append(entry)
    if len(stats["recent_tasks"]) > 10:
        stats["recent_tasks"] = stats["recent_tasks"][-10:]
        
    stats["last_updated"] = datetime.now().isoformat()
    
    with open(STATS_FILE, "w") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

# Mock data injection
log_task("Token Monitor Setup", 5000, 2000, 0.0005)
log_task("Dashboard Codegen", 8000, 3000, 0.001)
print("✅ Logger ready and data generated.")
