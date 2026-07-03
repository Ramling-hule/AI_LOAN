class DerivedRuleEngine:
    def evaluate(self, rules: list, applicant_data: dict) -> list:
        results = []
        
        try:
            revenue = float(applicant_data.get("annual_turnover") or 0)
            liabilities = float(applicant_data.get("total_liabilities") or 0)
            dti = liabilities / max(revenue, 1)
            applicant_data["debt_to_income"] = dti
        except:
            dti = None

        for rule in rules:
            if rule.get("rule_type") != "Derived":
                continue
            param = rule.get("parameter", "")
            val = applicant_data.get(param, applicant_data.get(param.lower()))
            
            status = "PASS" if val is not None else "NOT AVAILABLE"
            results.append({
                "rule_id": rule.get("rule_id"),
                "rule_name": rule.get("description"),
                "rule_type": "Derived",
                "engine": "DerivedRuleEngine",
                "status": status,
                "applicant_value": val,
                "reason": f"Derived rule calculated: {param}={val}",
                "confidence": 1.0
            })
        return results

derived_rule_engine = DerivedRuleEngine()
