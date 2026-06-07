"""
LexAgent SDK — Python example
Financial decision agent with compliance monitoring
"""

import os
from lexagent import LexAgentSDK, LexAgentRiskError

lex = LexAgentSDK(
    api_key=os.environ["LEXAGENT_API_KEY"],
    agent_name="loan-decision-agent",
    frameworks=["EU_AI_ACT", "GDPR", "NIST_RMF"],
    block_on_high_risk=True,
)


# Decorator usage — zero code changes to existing functions
@lex.monitor(action_type="TOOL_USE")
def fetch_credit_score(applicant_id: str) -> int:
    # Your existing logic unchanged
    return 712


@lex.monitor(action_type="TOOL_USE")
def fetch_income_data(applicant_id: str) -> dict:
    return {"monthly_income": 3500, "employment": "permanent"}


def process_loan_application(applicant_id: str, requested_amount: float):
    session = lex.session()

    try:
        # Data access — HIGH RISK, synchronous check
        session.action("DATA_ACCESS", {
            "resource": "applicants.financial_profile",
            "operation": "read",
        })

        # Tools — batched async
        score = fetch_credit_score(applicant_id)
        income = fetch_income_data(applicant_id)

        approved = score >= 700 and income["monthly_income"] >= requested_amount / 36

        # Decision — HIGH RISK, synchronous check
        session.action("DECISION", {
            "description": "Loan application decision",
            "inputs": {"credit_score": score, "income": income, "requested_amount": requested_amount},
            "outputs": {"approved": approved, "reason": "automated_scoring"},
        })

        session.end({"outcome": "approved" if approved else "denied"})

        # Compliance status
        status = lex.get_compliance_status()
        print(f"Compliance status: {status['overallRisk']}")

        return approved

    except LexAgentRiskError as e:
        print(f"Action blocked: {e}")
        print(f"Risk level: {e.risk_level}")
        # Hand off to human underwriter
        session.action("HUMAN_HANDOFF", {
            "reason": str(e),
            "context": {"applicant_id": applicant_id},
        })
        return None


if __name__ == "__main__":
    result = process_loan_application("applicant_xyz", 15000.0)
    print(f"Decision: {'Approved' if result else 'Denied'}")
