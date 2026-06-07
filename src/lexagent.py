"""
LexAgent SDK for Python
AI Compliance Counsel for Autonomous Agents
https://lexagent.io
"""

import re
import json
import uuid
import threading
import time
from datetime import datetime, timezone
from typing import Optional, Callable, Any
try:
    import httpx
    _HTTP = "httpx"
except ImportError:
    import urllib.request
    _HTTP = "urllib"

LEXAGENT_API = os.environ.get("LEXAGENT_API_URL", "https://lexagent-api.onrender.com/v1")
SDK_VERSION = "0.1.0"
HIGH_RISK_TYPES = {"EXTERNAL_WRITE", "DATA_ACCESS", "DECISION"}


class LexAgentRiskError(Exception):
    def __init__(self, assessment: dict):
        super().__init__(f"[LexAgent] Action blocked — {assessment.get('reason')}")
        self.risk_level = assessment.get("riskLevel")
        self.frameworks = assessment.get("frameworks", [])
        self.recommendation = assessment.get("recommendation")
        self.assessment = assessment


class LexAgentSDK:
    def __init__(
        self,
        api_key: str,
        agent_id: Optional[str] = None,
        agent_name: str = "unnamed-agent",
        frameworks: Optional[list] = None,
        risk_threshold: str = "medium",
        block_on_high_risk: bool = True,
        on_risk_detected: Optional[Callable] = None,
        silent: bool = False,
        flush_interval: int = 3,
    ):
        if not api_key:
            raise ValueError("[LexAgent] api_key is required")

        self.api_key = api_key
        self.agent_id = agent_id or self._generate_id()
        self.agent_name = agent_name
        self.frameworks = frameworks or ["EU_AI_ACT", "GDPR"]
        self.risk_threshold = risk_threshold
        self.block_on_high_risk = block_on_high_risk
        self.on_risk_detected = on_risk_detected
        self.silent = silent
        self._queue: list = []
        self._lock = threading.Lock()
        self._start_flush(flush_interval)

    # ── Core ──────────────────────────────────────────────────────────────────

    def action(self, action_type: str, payload: Any, meta: dict = {}) -> dict:
        event = self._build_event(action_type, payload, meta)
        self._log(f"[LexAgent] action captured: {action_type}")

        if action_type in HIGH_RISK_TYPES and self.block_on_high_risk:
            result = self._check_risk(event)
            if result.get("blocked"):
                self._log(f"[LexAgent] action BLOCKED — risk: {result.get('riskLevel')} — {result.get('reason')}")
                if self.on_risk_detected:
                    self.on_risk_detected(result)
                raise LexAgentRiskError(result)
            event["riskAssessment"] = result
        else:
            with self._lock:
                self._queue.append(event)

        return event

    # ── Convenience wrappers ──────────────────────────────────────────────────

    def api_call(self, endpoint: str, data: Any, meta: dict = {}) -> dict:
        return self.action("API_CALL", {"endpoint": endpoint, "data": data}, meta)

    def data_access(self, resource: str, operation: str, meta: dict = {}) -> dict:
        return self.action("DATA_ACCESS", {"resource": resource, "operation": operation}, meta)

    def decision(self, description: str, inputs: Any, outputs: Any, meta: dict = {}) -> dict:
        return self.action("DECISION", {"description": description, "inputs": inputs, "outputs": outputs}, meta)

    def tool_use(self, tool_name: str, params: Any, meta: dict = {}) -> dict:
        return self.action("TOOL_USE", {"toolName": tool_name, "params": params}, meta)

    def external_write(self, target: str, content: Any, meta: dict = {}) -> dict:
        return self.action("EXTERNAL_WRITE", {"target": target, "content": content}, meta)

    def human_handoff(self, reason: str, context: Any, meta: dict = {}) -> dict:
        return self.action("HUMAN_HANDOFF", {"reason": reason, "context": context}, meta)

    # ── Session ───────────────────────────────────────────────────────────────

    def session(self, session_id: Optional[str] = None) -> "LexAgentSession":
        return LexAgentSession(self, session_id or self._generate_id())

    def get_compliance_status(self) -> dict:
        return self._post("/agents/status", {
            "agentId": self.agent_id,
            "frameworks": self.frameworks
        })

    def generate_report(self, format: str = "pdf") -> dict:
        return self._post("/reports/generate", {
            "agentId": self.agent_id,
            "format": format,
            "frameworks": self.frameworks
        })

    # ── Decorator ─────────────────────────────────────────────────────────────

    def monitor(self, action_type: str = "TOOL_USE"):
        """Decorator to automatically monitor a function as an agent action."""
        def decorator(fn):
            def wrapper(*args, **kwargs):
                result = fn(*args, **kwargs)
                self.action(action_type, {
                    "function": fn.__name__,
                    "args": str(args)[:200],
                    "result": str(result)[:200]
                })
                return result
            wrapper.__name__ = fn.__name__
            return wrapper
        return decorator

    # ── Internals ─────────────────────────────────────────────────────────────

    def _build_event(self, action_type: str, payload: Any, meta: dict) -> dict:
        return {
            "id": self._generate_id(),
            "agentId": self.agent_id,
            "agentName": self.agent_name,
            "type": action_type,
            "payload": self._sanitize(payload),
            "meta": meta,
            "frameworks": self.frameworks,
            "sdkVersion": SDK_VERSION,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "environment": "python"
        }

    def _check_risk(self, event: dict) -> dict:
        try:
            return self._post("/risk/check", event)
        except Exception:
            return {"blocked": False, "riskLevel": "unknown", "reason": "LexAgent unreachable — fail open"}

    def _flush(self):
        with self._lock:
            if not self._queue:
                return
            batch = self._queue[:50]
            self._queue = self._queue[50:]
        try:
            self._post("/events/batch", {"events": batch})
        except Exception:
            with self._lock:
                if len(self._queue) < 200:
                    self._queue = batch + self._queue

    def _start_flush(self, interval: int):
        def loop():
            while not self._stop_event.is_set():
                time.sleep(interval)
                self._flush()
        self._stop_event = threading.Event()
        t = threading.Thread(target=loop, daemon=True)
        t.start()

    def _post(self, path: str, body: dict) -> dict:
        headers = {
            "Content-Type": "application/json",
            "X-LexAgent-Key": self.api_key,
            "X-LexAgent-Version": SDK_VERSION
        }
        data = json.dumps(body).encode()
        if _HTTP == "httpx":
            resp = httpx.post(f"{LEXAGENT_API}{path}", content=data, headers=headers, timeout=5)
            resp.raise_for_status()
            return resp.json()
        else:
            req = urllib.request.Request(f"{LEXAGENT_API}{path}", data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read())

    def _sanitize(self, payload: Any) -> Any:
        s = json.dumps(payload)
        s = re.sub(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b', '[EMAIL_REDACTED]', s)
        s = re.sub(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b', '[CARD_REDACTED]', s)
        return json.loads(s)

    def _generate_id(self) -> str:
        return "lxa_" + uuid.uuid4().hex[:12]

    def _log(self, msg: str):
        if not self.silent:
            print(msg)

    def __del__(self):
        if hasattr(self, '_stop_event'):
            self._stop_event.set()
        self._flush()


class LexAgentSession:
    def __init__(self, sdk: LexAgentSDK, session_id: str):
        self.sdk = sdk
        self.session_id = session_id

    def action(self, action_type: str, payload: Any, meta: dict = {}) -> dict:
        return self.sdk.action(action_type, payload, {**meta, "sessionId": self.session_id})

    def end(self, outcome: Any = None) -> dict:
        return self.sdk.action("SESSION_END", {"outcome": outcome}, {"sessionId": self.session_id})
