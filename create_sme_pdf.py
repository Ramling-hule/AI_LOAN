import os

try:
    from fpdf import FPDF
except ImportError:
    import sys
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf"])
    from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'SME Loan Eligibility Criteria & Bank Policies', 0, 1, 'C')
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, 'Page ' + str(self.page_no()) + '/{nb}', 0, 0, 'C')

    def chapter_title(self, title):
        self.set_font('Arial', 'B', 12)
        self.set_fill_color(200, 220, 255)
        self.cell(0, 10, title, 0, 1, 'L', 1)
        self.ln(4)

    def chapter_body(self, body):
        self.set_font('Arial', '', 11)
        # Handle multi_cell and allow simple markup like bullets
        for line in body.split('\n'):
            self.multi_cell(0, 8, line)
        self.ln(5)

pdf = PDF()
pdf.alias_nb_pages()
pdf.add_page()

# Section 1
pdf.chapter_title('1. Core Eligibility Criteria')
body1 = """To secure an SME (Small and Medium Enterprise) loan, lenders evaluate businesses based on financial stability, operational history, and creditworthiness.

- Business Vintage: Minimum operational period, typically 2 to 3 years.
- Annual Turnover: Minimum threshold (e.g., Rs. 10 lakh to Rs. 40 lakh depending on lender).
- Profitability: History of being profitable for at least 1 to 2 consecutive years.
- Credit Score: A strong credit score (typically 700+) for both the business and the promoter.
- Age of Borrower: Applicants must generally be between 21 and 65 years old.
- Registration: Must have valid business registrations (e.g., Udyam, GST, Shop Act)."""
pdf.chapter_body(body1)

# Section 2
pdf.chapter_title('2. Documentation Requirements')
body2 = """Keeping paperwork consistent is key to fast loan approval.

- KYC Documents: Aadhaar, PAN card, and address proof for proprietors/partners/directors.
- Business Proof: Udyam Registration, GST, Partnership Deed, or Certificate of Incorporation.
- Financial Statements: Last 2-3 years of audited financials, ITR, and 6-12 months of bank statements.
- Other: Detailed business plan and details of existing debts/liabilities."""
pdf.chapter_body(body2)

# Section 3
pdf.chapter_title('3. Standard Bank Policies')
body3 = """- Collateral & Security: Loans may be secured (property/assets) or unsecured. Collateral-free loans up to certain limits are available under government schemes like CGTMSE.
- Asset Classification: Accounts are monitored regularly. Restructured loans might initially be downgraded until satisfactory performance is shown.
- Lending Approach: Banks often use a cluster-based approach, providing specialized services to enterprises in recognized industrial clusters.
- Prepayment Policies: Many banks allow prepayment of floating-rate loans without penalty for Micro and Small Enterprises, though subject to the specific agreement.
- Financial Transparency: Inconsistencies across tax filings, bank statements, and applications are a primary cause for rejection. Avoid applying to multiple lenders simultaneously to prevent a 'credit-hungry' appearance."""
pdf.chapter_body(body3)

file_path = os.path.join(os.getcwd(), 'SME_Loan_Eligibility_and_Policies.pdf')
pdf.output(file_path)
print(f"PDF successfully generated at: {file_path}")
