export interface LexAgentOptions {
  apiKey: string;
  agentId?: string;
  agentName?: string;
  frameworks?: Framework[];
  riskThreshold?: 'low' | 'medium' | 'high';
  blockOnHighRisk?: boolean;
  onRiskDetected?: (assessment: RiskAssessment) => void;
  silent?: boolean;
  flushInterval?: number;
}

export type Framework =
  | 'EU_AI_ACT'
  | 'GDPR'
  | 'NIST_RMF'
  | 'ISO_42001'
  | 'SOC2'
  | 'CCPA'
  | 'HIPAA'
  | 'COLORADO_AI_ACT'
  | 'UK_AI'
  | 'SINGAPORE_MFAI'
  | string;

export type ActionType =
  | 'API_CALL'
  | 'DATA_ACCESS'
  | 'DECISION'
  | 'TOOL_USE'
  | 'EXTERNAL_WRITE'
  | 'HUMAN_HANDOFF'
  | 'SESSION_END'
  | string;

export interface AgentEvent {
  id: string;
  agentId: string;
  agentName: string;
  type: ActionType;
  payload: unknown;
  meta: Record<string, unknown>;
  frameworks: Framework[];
  sdkVersion: string;
  timestamp: string;
  environment: string;
  riskAssessment?: RiskAssessment;
}

export interface RiskAssessment {
  blocked: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  reason: string;
  frameworks: Framework[];
  articles?: string[];
  recommendation?: string;
  blockchainTxHash?: string;
}

export interface ComplianceStatus {
  agentId: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  frameworks: Record<Framework, { compliant: boolean; gaps: string[] }>;
  lastChecked: string;
  totalEvents: number;
  blockedEvents: number;
}

export class LexAgentRiskError extends Error {
  riskLevel: string;
  frameworks: Framework[];
  recommendation?: string;
  assessment: RiskAssessment;
  constructor(assessment: RiskAssessment);
}

export class LexAgentSession {
  sessionId: string;
  action(type: ActionType, payload: unknown, meta?: Record<string, unknown>): Promise<AgentEvent>;
  end(outcome?: unknown): Promise<AgentEvent>;
}

export class LexAgentSDK {
  constructor(options: LexAgentOptions);

  action(type: ActionType, payload: unknown, meta?: Record<string, unknown>): Promise<AgentEvent>;
  apiCall(endpoint: string, data: unknown, meta?: Record<string, unknown>): Promise<AgentEvent>;
  dataAccess(resource: string, operation: string, meta?: Record<string, unknown>): Promise<AgentEvent>;
  decision(description: string, inputs: unknown, outputs: unknown, meta?: Record<string, unknown>): Promise<AgentEvent>;
  toolUse(toolName: string, params: unknown, meta?: Record<string, unknown>): Promise<AgentEvent>;
  externalWrite(target: string, content: unknown, meta?: Record<string, unknown>): Promise<AgentEvent>;
  humanHandoff(reason: string, context: unknown, meta?: Record<string, unknown>): Promise<AgentEvent>;

  session(sessionId?: string): LexAgentSession;
  getComplianceStatus(): Promise<ComplianceStatus>;
  generateReport(format?: 'pdf' | 'json' | 'html'): Promise<{ url: string; expiresAt: string }>;
  destroy(): void;
}

export function lexagentMiddleware(sdk: LexAgentSDK): (req: unknown, res: unknown, next: () => void) => void;

export default LexAgentSDK;
