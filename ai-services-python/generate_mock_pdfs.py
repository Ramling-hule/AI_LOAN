import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def create_pdf(filename, title, content_list):
    doc = SimpleDocTemplate(filename, pagesize=letter,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#1E3A8A'), # Navy Blue
        spaceAfter=15
    )
    section_style = ParagraphStyle(
        'DocSection',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#2563EB'), # Light Blue
        spaceBefore=10,
        spaceAfter=10
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['BodyText'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1F2937') # Dark Grey
    )
    header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontSize=9,
        leading=11,
        textColor=colors.white,
        fontName='Helvetica-Bold'
    )
    
    story = []
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 10))
    
    for item in content_list:
        type_ = item[0]
        val = item[1]
        
        if type_ == 'p':
            story.append(Paragraph(val, body_style))
            story.append(Spacer(1, 8))
        elif type_ == 'h':
            story.append(Paragraph(val, section_style))
            story.append(Spacer(1, 5))
        elif type_ == 'table':
            data = []
            col_widths = item[2] if len(item) > 2 else None
            
            # Format table content as Paragraphs to allow text wrapping
            for row_idx, row in enumerate(val):
                formatted_row = []
                for cell in row:
                    if row_idx == 0:
                        formatted_row.append(Paragraph(str(cell), header_style))
                    else:
                        formatted_row.append(Paragraph(str(cell), body_style))
                data.append(formatted_row)
                
            t = Table(data, colWidths=col_widths)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1E3A8A')),
                ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#D1D5DB')),
                ('TOPPADDING', (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F3F4F6')])
            ]))
            story.append(t)
            story.append(Spacer(1, 10))
        elif type_ == 'page_break':
            story.append(PageBreak())
            
    doc.build(story)
    print(f"Created {filename}")

def main():
    out_dir = "mock-docs"
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. PAN Card
    create_pdf(
        os.path.join(out_dir, "pan.pdf"),
        "INCOME TAX DEPARTMENT - GOVERNMENT OF INDIA",
        [
            ('h', "Permanent Account Number (PAN) Card"),
            ('p', "This is to certify that the Permanent Account Number specified below has been issued to the entity registered under the Income Tax Act."),
            ('table', [
                ["Field", "Details"],
                ["Permanent Account Number (PAN)", "AAAHA8392M"],
                ["Name of Holder", "TechNova Solutions Pvt Ltd"],
                ["Father's Name / Promoter Name", "TechNova Founder"],
                ["Date of Incorporation", "15/03/2022"],
                ["Entity Type", "Company / Private Limited"]
            ], [180, 300])
        ]
    )

    # 2. Aadhaar Card
    create_pdf(
        os.path.join(out_dir, "aadhaar.pdf"),
        "UNIQUE IDENTIFICATION AUTHORITY OF INDIA",
        [
            ('h', "Government of India - Aadhaar Card Statement"),
            ('p', "Aadhaar is a proof of identity, not of citizenship. To verify Aadhaar, please use Aadhaar QR code scanner or verify online."),
            ('table', [
                ["Field", "Details"],
                ["Aadhaar Number", "1234 5678 9012"],
                ["Full Name", "TechNova Founder"],
                ["Date of Birth", "01/01/1990"],
                ["Gender", "Male"],
                ["Address", "100 AI Boulevard, Tech Park, Bandra Kurla Complex, Mumbai, Maharashtra - 400051"]
            ], [150, 330])
        ]
    )

    # 3. GST Certificate
    create_pdf(
        os.path.join(out_dir, "gst_certificate.pdf"),
        "FORM GST REG-06 - GOVERNMENT OF INDIA",
        [
            ('h', "Registration Certificate of Goods and Services Tax"),
            ('p', "This is a digital registration certificate issued under section 22 of the Central Goods and Services Tax Act, 2017."),
            ('table', [
                ["Registration Details", "Value"],
                ["Registration Number (GSTIN)", "27AAAHA8392M1ZA"],
                ["Legal Name", "TechNova Solutions Pvt Ltd"],
                ["Trade Name", "TechNova Solutions"],
                ["Constitution of Business", "Private Limited Company"],
                ["Address of Principal Place of Business", "100 AI Boulevard, Tech Park, BKC, Mumbai, Maharashtra, 400051"],
                ["Date of Liability", "15/03/2022"],
                ["Period of Validity", "From 15/03/2022 to Perpetual"],
                ["Type of Registration", "Regular"]
            ], [200, 280])
        ]
    )

    # 4. Bank Statement
    create_pdf(
        os.path.join(out_dir, "bank_statements.pdf"),
        "HDFC BANK LIMITED - CURRENT ACCOUNT STATEMENT",
        [
            ('h', "Account Summary"),
            ('table', [
                ["Parameter", "Details"],
                ["Account Name", "TechNova Solutions Pvt Ltd"],
                ["Account Number", "50200067341258"],
                ["IFSC Code", "HDFC0000240"],
                ["Account Type", "Current Account"],
                ["Average Monthly Balance (AMB)", "550000.00"],
                ["Total Bounces / ECS Return Count", "0"]
            ], [180, 300]),
            ('h', "Statement Period: 01-Dec-2025 to 31-May-2026"),
            ('table', [
                ["Date", "Description", "Chq No.", "Withdrawal", "Deposit", "Balance"],
                ["01-Dec-2025", "Opening Balance", "-", "-", "-", "500,000.00"],
                ["15-Dec-2025", "GST Refund Deposit", "-", "-", "250,000.00", "750,000.00"],
                ["02-Jan-2026", "HDFC Loan EMI Payment", "1024", "53,500.00", "-", "696,500.00"],
                ["15-Jan-2026", "Vendor Payout - AWS Services", "-", "40,000.00", "-", "656,500.00"],
                ["28-Jan-2026", "Customer Payment - TCS Corp", "-", "-", "150,000.00", "806,500.00"],
                ["02-Feb-2026", "HDFC Loan EMI Payment", "1025", "53,500.00", "-", "753,000.00"],
                ["18-Feb-2026", "Office Rent BKC Office", "1026", "100,000.00", "-", "653,000.00"],
                ["02-Mar-2026", "HDFC Loan EMI Payment", "1027", "53,500.00", "-", "599,500.00"],
                ["15-Mar-2026", "Customer Payment - Reliance", "-", "-", "300,000.00", "899,500.00"],
                ["02-Apr-2026", "HDFC Loan EMI Payment", "1028", "53,500.00", "-", "846,000.00"],
                ["10-Apr-2026", "Salaries Disbursement", "-", "350,000.00", "-", "496,000.00"],
                ["02-May-2026", "HDFC Loan EMI Payment", "1029", "53,500.00", "-", "442,500.00"],
                ["25-May-2026", "Customer Payment - Infosys", "-", "-", "200,000.00", "642,500.00"],
                ["31-May-2026", "Closing Balance", "-", "-", "-", "642,500.00"]
            ], [60, 150, 45, 75, 75, 75])
        ]
    )

    # 5. ITR
    create_pdf(
        os.path.join(out_dir, "itr.pdf"),
        "INCOME TAX DEPARTMENT - ACKNOWLEDGEMENT STATEMENT",
        [
            ('h', "Indian Income Tax Return Acknowledgement (ITR-V) - AY 2025-26"),
            ('p', "Filed under the provisions of Section 139(1) of the Income Tax Act, 1961."),
            ('table', [
                ["Parameter", "Details"],
                ["Assessment Year", "2025-26"],
                ["PAN of Corporation", "AAAHA8392M"],
                ["Legal Name", "TechNova Solutions Pvt Ltd"],
                ["Status of Assessee", "Company - Private Limited"],
                ["Form Type", "ITR-6"],
                ["Gross Total Income (INR)", "1000000.00"],
                ["Net Taxable Income (INR)", "1000000.00"],
                ["Total Taxes Paid (INR)", "250000.00"],
                ["Filing Date", "31/07/2025"],
                ["Acknowledgement Number", "8920194827301938"]
            ], [180, 300])
        ]
    )

    # 6. Balance Sheets
    create_pdf(
        os.path.join(out_dir, "balance_sheets.pdf"),
        "AUDITED BALANCE SHEET - FY 2024-25",
        [
            ('h', "Balance Sheet of TechNova Solutions Pvt Ltd as of 31-March-2025"),
            ('table', [
                ["Liabilities", "Amount (INR)", "Assets", "Amount (INR)"],
                ["Share Capital", "500,000.00", "Fixed Assets (Computers/Servers)", "450,000.00"],
                ["Reserves & Surplus", "1,200,000.00", "Current Assets - Trade Receivables", "850,000.00"],
                ["Long-Term Secured Loans", "1,875,000.00", "Cash & Cash Equivalents", "642,500.00"],
                ["Short-Term Current Liabilities", "305,000.00", "Loans & Advances given", "1,937,500.00"],
                ["Total Liabilities", "3,880,000.00", "Total Assets", "3,880,000.00"]
            ], [150, 90, 150, 90]),
            ('h', "Additional Financial Disclosures"),
            ('p', "The company has an outstanding secured loan balance of ₹1,875,000 (secured against corporate property). Total liabilities of the company sum up to ₹2,180,000 (comprising securing loan of ₹1,875,000 and current liabilities of ₹305,000).")
        ]
    )

    # 7. Profit & Loss
    create_pdf(
        os.path.join(out_dir, "profit_loss.pdf"),
        "AUDITED PROFIT & LOSS STATEMENT - FY 2024-25",
        [
            ('h', "P&L Statement of TechNova Solutions Pvt Ltd"),
            ('table', [
                ["Revenue Head", "Amount (INR)"],
                ["Gross Sales / Revenue from Operations", "4200000.00"],
                ["Other Income", "0.00"],
                ["Total Revenue (Turnover)", "4200000.00"]
            ], [280, 200]),
            ('h', "Expenses & Deductions"),
            ('table', [
                ["Expense Head", "Amount (INR)"],
                ["Operating Expenses & Server Costs", "2,000,000.00"],
                ["Employee Benefit Salaries", "800,000.00"],
                ["Depreciation and Finance Costs", "150,000.00"],
                ["Total Expenses", "2,950,000.00"]
            ], [280, 200]),
            ('h', "Profit Metrics Summary"),
            ('table', [
                ["Metric", "Value (INR)"],
                ["Earnings Before Interest, Tax & Depreciation (EBITDA)", "1,400,000.00"],
                ["Profit Before Tax (PBT)", "1,250,000.00"],
                ["Provision for Corporate Tax", "250,000.00"],
                ["Net Profit after Taxes (PAT)", "1000000.00"]
            ], [280, 200])
        ]
    )

    # 8. Loan Documents
    create_pdf(
        os.path.join(out_dir, "loan_documents.pdf"),
        "HDFC BANK SECURED LOAN SANCTION CONTRACT",
        [
            ('h', "Sanction Letter & Debt Obligation Contract"),
            ('p', "This agreement is executed between HDFC Bank Limited and the borrower outlined below."),
            ('table', [
                ["Parameter", "Details"],
                ["Borrower Entity Name", "TechNova Solutions Pvt Ltd"],
                ["Primary Guarantee Owner", "TechNova Founder"],
                ["Sanctioned Principal Amount", "₹25,00,000.00"],
                ["Outstanding Secured Loan Balance", "1875000.00"],
                ["Interest Rate", "9.5% p.a. Fixed Rate"],
                ["Tenure", "60 Months"],
                ["Monthly Installment (EMI)", "53500.00"],
                ["Security / Collateral Mortgage", "Commercial Property located at BKC Mumbai, estimated value ₹50,00,000.00"]
            ], [200, 280])
        ]
    )

if __name__ == "__main__":
    main()
