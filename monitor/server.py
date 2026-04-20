import uvicorn
import json
from pathlib import Path
from fastapi import FastAPI

app = FastAPI()

DATA_DIR = Path(__file__).parent / "token_data"

@app.get("/api/stats")
def get_stats():
    log_file = DATA_DIR / "token_log.jsonl"
    stats_file = DATA_DIR / "stats.json"
    
    stats = {"total_input": 0, "total_output": 0, "cost": 0.0, "logs": []}
    
    if stats_file.exists():
        with open(stats_file) as f:
            stats = json.load(f)
    elif log_file.exists():
        # 기본값 생성
        with open(log_file) as f:
            lines = f.readlines()
            for line in lines:
                data = json.loads(line)
                stats['logs'].append(data)
                stats['total_input'] += data['input_tokens']
                stats['total_output'] += data['output_tokens']
                stats['cost'] += data['cost']
    
    return stats

@app.get("/")
def dashboard():
    return FileResponse(Path(__file__).parent / "dashboard.html")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
