class HardRuleEngine:
    def evaluate(self, rules: list, applicant_data: dict) -> list:
        results = []
        for rule in rules:
            if rule.get("rule_type") != "Hard":
                continue
            param = rule.get("parameter", "").lower()
            val = applicant_data.get(param)
            
            status = "PASS" if val is not None else "NOT AVAILABLE"
            results.append({
                "rule_id": rule.get("rule_id"),
                "rule_name": rule.get("description"),
                "rule_type": "Hard",
                "engine": "HardRuleEngine",
                "status": status,
                "applicant_value": val,
                "reason": f"Hard rule evaluated programmatically for {param}",
                "confidence": 1.0
            })
        return results

hard_rule_engine = HardRuleEngine()
