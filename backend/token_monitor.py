"""
Bike Project - Token Usage Monitor
실시간 LLM 토큰 사용량 추적 및 대시보드 API
"""
import os
import time
import json
import threading
from datetime import datetime
from pathlib import Path

# 토큰 모니터링 데이터
_TOKEN_LOG_FILE = Path(__file__).parent / "cache" / "token_log.jsonl"
_STATS_FILE = Path(__file__).parent / "cache" / "token_stats.json"

# 메모리 상태
_stats_lock = threading.Lock()
_stats = {
    "total_input_tokens": 0,
    "total_output_tokens": 0,
    "total_tokens": 0,
    "total_estimated_cost": 0.0,
    "task_count": 0,
    "sessions": [],
    "started_at": datetime.now().isoformat(),
}

def _load_stats():
    global _stats
    if _STATS_FILE.exists():
        try:
            with open(_STATS_FILE) as f:
                _stats = json.load(f)
        except:
            pass

def _save_stats():
    _STATS_file.parent.mkdir(parents=True, exist_ok=True)
    with open(_STATS_FILE, 'w') as f:
        json.dump(_stats, f, indent=2, ensure_ascii=False)

def _write_log(task_name: str, input_tokens: int, output_tokens: int,
               cost: float, model: str = "", status: str = "success"):
    _STATS_file.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now().isoformat(),
        "task": task_name,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "cost": round(cost, 6),
        "model": model,
        "status": status,
    }
    with open(_TOKEN_LOG_FILE, 'a') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

def _update_stats(input_tokens: int, output_tokens: int, cost: float, task_name: str, model: str = ""):
    """통계 업데이트"""
    with _stats_lock:
        _stats["total_input_tokens"] += input_tokens
        _stats["total_output_tokens"] += output_tokens
        _stats["total_tokens"] += input_tokens + output_tokens
        _stats["total_estimated_cost"] += cost
        _stats["task_count"] += 1
        _stats["sessions"].append({
            "task": task_name,
            "time": datetime.now().isoformat(),
            "tokens": input_tokens + output_tokens,
            "cost": round(cost, 6),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "model": model,
        })
        # 최근 50개만 유지
        if len(_stats["sessions"]) > 50:
            _stats["sessions"] = _stats["sessions"][-50:]
        _save_stats()

def record_token_usage(task_name: str, input_tokens: int, output_tokens: int,
                       cost: float = 0.0, model: str = "", status: str = "success"):
    """LLM API 호출 결과를 기록"""
    _write_log(task_name, input_tokens, output_tokens, cost, model, status)
    _update_stats(input_tokens, output_tokens, cost, task_name, model)

def record_error(task_name: str, error: str):
    """실패한 호출 기록"""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "task": task_name,
        "error": str(error),
        "status": "error",
    }
    _STATS_file.parent.mkdir(parents=True, exist_ok=True)
    with open(_TOKEN_LOG_FILE, 'a') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def get_stats():
    """현재 통계 조회"""
    with _stats_lock:
        now = datetime.now()
        start = datetime.fromisoformat(_stats["started_at"])
        elapsed = (now - start).total_seconds()
        hours = elapsed / 3600 if elapsed > 0 else 1
        
        return {
            "total_input_tokens": _stats["total_input_tokens"],
            "total_output_tokens": _stats["total_output_tokens"],
            "total_tokens": _stats["total_tokens"],
            "total_estimated_cost": round(_stats["total_estimated_cost"], 6),
            "task_count": _stats["task_count"],
            "elapsed_seconds": round(elapsed, 0),
            "tasks_per_hour": round(_stats["task_count"] / hours, 1),
            "tokens_per_hour": round(_stats["total_tokens"] / hours, 1),
            "cost_per_hour": round(_stats["total_estimated_cost"] / hours, 6),
            "sessions": _stats["sessions"][-10:],  # 최근 10건
            "started_at": _stats["started_at"],
        }


def get_recent_logs(limit: int = 20):
    """최근 로그 조회"""
    if not _TOKEN_LOG_FILE.exists():
        return []
    with open(_TOKEN_LOG_FILE) as f:
        lines = f.readlines()
    return [json.loads(line) for line in lines[-limit:]]


# 모듈 로드 시 초기화
_load_stats()
