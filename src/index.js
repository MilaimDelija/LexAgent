/**
 * LexAgent SDK
 * AI Compliance Monitor for Autonomous Agents
 * https://neuronium.engineer
 */

const LEXAGENT_API = process.env.LEXAGENT_API_URL || 'https://lexagent-api.onrender.com/v1';
const SDK_VERSION = '0.1.0';

class LexAgentSDK {
  constructor(options = {}) {
    if (!options.apiKey) throw new Error('[LexAgent] apiKey is required');

    this.apiKey = options.apiKey;
    this.agentId = options.agentId || this._generateId();
    this.agentName = options.agentName || 'unnamed-agent';
    this.frameworks = options.frameworks || ['EU_AI_ACT', 'GDPR'];
    this.riskThreshold = options.riskThreshold || 'medium';
    this.blockOnHighRisk = options.blockOnHighRisk !== false;
    this.onRiskDetected = options.onRiskDetected || null;
    this.silent = options.silent || false;
    this.queue = [];
    this.flushInterval = options.flushInterval || 3000;
    this._startFlush();
  }

  // ─── Core: wrap an agent action ───────────────────────────────────────────

  async action(type, payload, meta = {}) {
    const event = this._buildEvent(type, payload, meta);
    this._log(`[LexAgent] action captured: ${type}`);

    // Sync risk check for high-risk action types
    if (this._isHighRiskType(type)) {
      const result = await this._checkRisk(event);
      if (result.blocked) {
        this._log(`[LexAgent] action BLOCKED — risk: ${result.riskLevel} — ${result.reason}`);
        if (this.onRiskDetected) this.onRiskDetected(result);
        throw new LexAgentRiskError(result);
      }
      event.riskAssessment = result;
    } else {
      this.queue.push(event);
    }

    return event;
  }

  // ─── Convenience wrappers ─────────────────────────────────────────────────

  async apiCall(endpoint, data, meta = {}) {
    return this.action('API_CALL', { endpoint, data }, meta);
  }

  async dataAccess(resource, operation, meta = {}) {
    return this.action('DATA_ACCESS', { resource, operation }, meta);
  }

  async decision(description, inputs, outputs, meta = {}) {
    return this.action('DECISION', { description, inputs, outputs }, meta);
  }

  async toolUse(toolName, params, meta = {}) {
    return this.action('TOOL_USE', { toolName, params }, meta);
  }

  async externalWrite(target, content, meta = {}) {
    return this.action('EXTERNAL_WRITE', { target, content }, meta);
  }

  async humanHandoff(reason, context, meta = {}) {
    return this.action('HUMAN_HANDOFF', { reason, context }, meta);
  }

  // ─── Session management ───────────────────────────────────────────────────

  session(sessionId) {
    return new LexAgentSession(this, sessionId || this._generateId());
  }

  async getComplianceStatus() {
    return this._post('/agents/status', {
      agentId: this.agentId,
      frameworks: this.frameworks
    });
  }

  async generateReport(format = 'pdf') {
    return this._post('/reports/generate', {
      agentId: this.agentId,
      format,
      frameworks: this.frameworks
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  _buildEvent(type, payload, meta) {
    return {
      id: this._generateId(),
      agentId: this.agentId,
      agentName: this.agentName,
      type,
      payload: this._sanitize(payload),
      meta,
      frameworks: this.frameworks,
      sdkVersion: SDK_VERSION,
      timestamp: new Date().toISOString(),
      environment: typeof process !== 'undefined' ? (process.env.NODE_ENV || 'unknown') : 'browser'
    };
  }

  async _checkRisk(event) {
    try {
      return await this._post('/risk/check', event);
    } catch {
      // Fail open — never block agent if LexAgent is unreachable
      return { blocked: false, riskLevel: 'unknown', reason: 'LexAgent unreachable — fail open' };
    }
  }

  async _flush() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, 50);
    try {
      await this._post('/events/batch', { events: batch });
    } catch {
      // Re-queue on failure (max 200 events to avoid memory leak)
      if (this.queue.length < 200) this.queue.unshift(...batch);
    }
  }

  _startFlush() {
    if (typeof setInterval !== 'undefined') {
      this._timer = setInterval(() => this._flush(), this.flushInterval);
    }
  }

  async _post(path, body) {
    const res = await fetch(`${LEXAGENT_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LexAgent-Key': this.apiKey,
        'X-LexAgent-Version': SDK_VERSION
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`LexAgent API error: ${res.status}`);
    return res.json();
  }

  _sanitize(payload) {
    // Remove common PII patterns from payloads before sending
    const str = JSON.stringify(payload);
    return JSON.parse(
      str
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
        .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]')
        .replace(/\b(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}\b/g, '[PHONE_REDACTED]')
    );
  }

  _isHighRiskType(type) {
    const highRisk = ['EXTERNAL_WRITE', 'DATA_ACCESS', 'DECISION'];
    return highRisk.includes(type) && this.blockOnHighRisk;
  }

  _generateId() {
    return 'lxa_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
  }

  _log(msg) {
    if (!this.silent) console.log(msg);
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
    this._flush();
  }
}

class LexAgentSession {
  constructor(sdk, sessionId) {
    this.sdk = sdk;
    this.sessionId = sessionId;
    this.events = [];
  }

  async action(type, payload, meta = {}) {
    return this.sdk.action(type, payload, { ...meta, sessionId: this.sessionId });
  }

  async end(outcome) {
    return this.sdk.action('SESSION_END', { outcome }, { sessionId: this.sessionId });
  }
}

class LexAgentRiskError extends Error {
  constructor(assessment) {
    super(`[LexAgent] Action blocked — ${assessment.reason}`);
    this.name = 'LexAgentRiskError';
    this.riskLevel = assessment.riskLevel;
    this.frameworks = assessment.frameworks;
    this.recommendation = assessment.recommendation;
    this.assessment = assessment;
  }
}

// ─── Python-style middleware wrapper (for Express / Fastify) ──────────────

function lexagentMiddleware(sdk) {
  return async (req, res, next) => {
    req.lexagent = {
      action: (type, payload, meta) =>
        sdk.action(type, payload, {
          ...meta,
          requestId: req.headers['x-request-id'],
          path: req.path,
          method: req.method
        })
    };
    next();
  };
}

module.exports = { LexAgentSDK, LexAgentSession, LexAgentRiskError, lexagentMiddleware };
module.exports.default = LexAgentSDK;
