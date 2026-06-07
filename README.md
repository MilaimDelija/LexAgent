# LexAgent SDK

**AI Compliance Monitor for Autonomous Agents**

Real-time compliance monitoring for every action your AI agents take — across EU AI Act, GDPR, NIST AI RMF, ISO 42001, SOC 2, CCPA, and 50+ global frameworks. Immutable blockchain audit trail included. Automated compliance documentation.

```bash
npm install @lexagent/sdk
pip install lexagent
```

---

## Quick Start

### JavaScript / TypeScript

```js
import { LexAgentSDK } from '@lexagent/sdk'

const lex = new LexAgentSDK({
  apiKey:          'lxa_your_key_here',
  agentName:       'customer-support-agent',
  frameworks:      ['EU_AI_ACT', 'GDPR', 'NIST_RMF'],
  blockOnHighRisk: true,
  onRiskDetected:  (r) => console.warn('Risk detected:', r.reason),
})

// Wrap agent actions
await lex.decision('Approve loan application', { score: 712 }, { approved: true })
await lex.dataAccess('users.profile', 'read')
await lex.toolUse('send_email', { to: '[EMAIL_REDACTED]', subject: 'Confirmation' })

// Get compliance status
const status = await lex.getComplianceStatus()

// Generate regulator-ready PDF report
const report = await lex.generateReport('pdf')
```

### Python

```python
from lexagent import LexAgentSDK

lex = LexAgentSDK(
    api_key="lxa_your_key_here",
    agent_name="support-agent-v2",
    frameworks=["EU_AI_ACT", "GDPR"],
)

# Use as decorator
@lex.monitor(action_type="TOOL_USE")
def send_refund(order_id, amount):
    return refund_service.process(order_id, amount)

# Or call directly
lex.decision("Deny credit application", inputs, outputs)
lex.data_access("payment_records", "read")

status = lex.get_compliance_status()
```

---

## Core Methods

| Method | Risk Level | Description |
|--------|-----------|-------------|
| `decision(description, inputs, outputs)` | 🔴 HIGH | Log an agent decision — synchronous risk check |
| `dataAccess(resource, operation)` | 🔴 HIGH | Log personal/sensitive data access |
| `externalWrite(target, content)` | 🔴 HIGH | Log writes to external systems |
| `toolUse(toolName, params)` | 🟡 MEDIUM | Log tool/API invocations — async batched |
| `apiCall(endpoint, data)` | 🟡 MEDIUM | Log external API calls — async batched |
| `humanHandoff(reason, context)` | 🟢 LOW | Log handoff to human operator |
| `getComplianceStatus()` | — | Current compliance posture across frameworks |
| `generateReport(format)` | — | PDF / JSON / HTML regulator-ready report |

**High-risk methods** trigger a synchronous compliance check before the action proceeds. If `blockOnHighRisk: true` (default), a `LexAgentRiskError` is thrown when the action exceeds the configured risk threshold.

---

## Express Middleware

```js
import { lexagentMiddleware } from '@lexagent/sdk'

app.use(lexagentMiddleware(lex))

app.post('/agent/action', async (req, res) => {
  await req.lexagent.action('TOOL_USE', { tool: 'search' })
  // ...
})
```

---

## Sessions

Group related events into a traceable session:

```js
const session = lex.session('user_session_abc123')
await session.action('TOOL_USE', { toolName: 'web_search' })
await session.action('DECISION', { ... })
await session.end({ outcome: 'resolved' })
```

---

## Supported Frameworks

| Framework | Region | Status |
|-----------|--------|--------|
| EU AI Act | European Union | ✅ Live |
| GDPR | European Union | ✅ Live |
| NIST AI RMF 1.1 | United States | ✅ Live |
| ISO/IEC 42001:2023 | International | ✅ Live |
| SOC 2 | United States | ✅ Live |
| CCPA | California, US | ✅ Live |
| Colorado AI Act | Colorado, US | 🔜 Soon |
| HIPAA | United States | 🔜 Soon |
| UK AI Framework | United Kingdom | 🔜 Soon |
| Singapore MFAI | Singapore | 🔜 Soon |
| Brazil LGPD | Brazil | 🔜 Soon |
| India DPDP | India | 📅 Planned |

---

## Why LexAgent

- **EU AI Act enforcement: August 2, 2026** — high-risk AI systems require immutable audit trails, technical documentation (Article 11), and automatic event logging (Article 12). Fines reach €35M or 7% of global turnover.
- **Most teams are not ready.** Organizations produce logs of prompts and completions — not queryable, structured compliance records of agent decisions.
- **LexAgent fills this gap.** Every agent action is captured, risk-assessed against your selected frameworks, and anchored to the Polygon blockchain — producing proof-of-compliance that survives any audit.

---

## PII Protection

LexAgent automatically redacts common PII patterns from all payloads before transmission:

- Email addresses → `[EMAIL_REDACTED]`
- Credit card numbers → `[CARD_REDACTED]`
- Phone numbers → `[PHONE_REDACTED]`

---

## Error Handling

```js
import { LexAgentRiskError } from '@lexagent/sdk'

try {
  await lex.decision('Deny insurance claim', inputs, outputs)
} catch (err) {
  if (err instanceof LexAgentRiskError) {
    console.error('Risk level:', err.riskLevel)       // 'high' | 'critical'
    console.error('Reason:', err.message)
    console.error('Recommendation:', err.recommendation)
    // Escalate to human reviewer
  }
}
```

**Fail-open by default:** if the LexAgent API is unreachable, the SDK never blocks your agent. All events are queued locally and flushed when connectivity is restored.

---

## Architecture

```
Your Agent
    │
    ▼
LexAgent SDK
    ├── PII Sanitizer
    ├── Risk Classifier (sync — high-risk actions)
    ├── Event Queue (async batch — medium/low risk)
    └── Blockchain Anchor (Polygon)
         └── Immutable audit trail
```

---

## License

MIT — © 2026 Neuronium Engineers

**Legal notice:** LexAgent provides compliance intelligence and risk monitoring. It does not constitute legal advice. For compliance opinions on specific situations, consult a qualified attorney.
