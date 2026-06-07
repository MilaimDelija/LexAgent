/**
 * LexAgent SDK — JavaScript example
 * LangChain-style customer support agent
 */

const { LexAgentSDK, LexAgentRiskError } = require('../src/index')

async function runSupportAgent(userMessage, userId) {
  const lex = new LexAgentSDK({
    apiKey:          process.env.LEXAGENT_API_KEY,
    agentName:       'support-agent',
    frameworks:      ['EU_AI_ACT', 'GDPR', 'NIST_RMF'],
    blockOnHighRisk: true,
    onRiskDetected:  (r) => console.warn('[LexAgent] Risk:', r.reason),
  })

  const session = lex.session()

  try {
    // Log data access
    await session.action('DATA_ACCESS', {
      resource:  'users.profile',
      operation: 'read',
    })

    // Log tool use — async, batched
    await session.action('TOOL_USE', {
      toolName: 'knowledge_base_search',
      params:   { query: userMessage },
    })

    // Log a decision — synchronous risk check
    const decision = await session.action('DECISION', {
      description: 'Issue refund',
      inputs:      { userId, amount: 49.99, reason: 'product defect' },
      outputs:     { approved: true, refundId: 'ref_abc123' },
    })

    console.log('Decision logged:', decision.id)
    console.log('Blockchain anchor:', decision.riskAssessment?.blockchainTxHash)

    await session.end({ outcome: 'resolved', satisfaction: 5 })

    // Generate compliance report
    const report = await lex.generateReport('pdf')
    console.log('Compliance report:', report.url)

  } catch (err) {
    if (err instanceof LexAgentRiskError) {
      console.error('Action blocked by LexAgent:', err.message)
      console.error('Risk level:', err.riskLevel)
      console.error('Recommendation:', err.recommendation)
      // Escalate to human reviewer
      await session.action('HUMAN_HANDOFF', {
        reason:  err.message,
        context: { userId, riskLevel: err.riskLevel },
      })
    } else {
      throw err
    }
  } finally {
    lex.destroy()
  }
}

runSupportAgent('I want a refund for my order', 'user_12345')
