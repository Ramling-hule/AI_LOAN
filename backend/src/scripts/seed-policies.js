import 'dotenv/config';
import mongoose from 'mongoose';
import { BankPolicyDocument } from '../models/index.js';
import { connectDB } from '../config/db.js';

const DEFAULTS = [
  {
    _id: 'sme_underwriting_policy',
    title: 'SME Credit Underwriting Policy (v4.2)',
    description: 'Core directives for SME eligibility and scoring thresholds.',
    filename: 'sme_credit_underwriting_policy_v4.pdf',
    url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf',
    public_id: 'capitalscale_bank_policies/default_policy_sme',
    size: 15420,
    mimetype: 'application/pdf',
    uploaded_by: 'system',
    uploaded_by_name: 'System Compliance',
    is_system_default: true,
    bank_name: 'System',
    content: `<div class="space-y-4">
  <div class="bg-slate-950 p-4 border border-white/5 rounded-2xl">
    <span class="text-[9px] font-mono text-slate-400">Directive Code: SME-CR-2026-v4 │ Issued: Board of Directors</span>
    <p class="mt-2 text-slate-200">This document sets forth mandatory underwriting parameters. Credit evaluation specialists must ensure that all loan applications undergo systematic checklist vetting matching the criteria outlined below.</p>
  </div>

  <div class="space-y-2">
    <h4 class="font-bold text-slate-200 text-sm">1. Core Financial Vetting Metrics</h4>
    <p>To reduce defaults on SME lending products, applicants must verify financial solvency against strict ledger parameters:</p>
    <ul class="list-disc pl-5 space-y-1.5 text-slate-300">
      <li><strong class="text-white">Annual Sales / Turnover:</strong> The borrower entity must demonstrate a minimum reported annual turnover of <span class="text-emerald-400 font-semibold">₹5,000,000 (Fifty Lakhs INR)</span> based on audited GST returns or tax ledger files.</li>
      <li><strong class="text-white">Leverage Ratio limit:</strong> Underwriters must calculate total outstanding liability. Debt-to-Equity (D/E) ratio must remain below <span class="text-amber-400 font-semibold">3.5</span>.</li>
      <li><strong class="text-white">Debt Coverage:</strong> Minimum Debt Service Coverage Ratio (DSCR) of <span class="text-emerald-400">1.25x</span> is required.</li>
    </ul>
  </div>

  <div class="space-y-2">
    <h4 class="font-bold text-slate-200 text-sm">2. Credit Risk Vetting Thresholds</h4>
    <p>The AI risk scoring engine computes ratings based on ledger, behavioural, and past credit histories:</p>
    <table class="w-full bg-slate-950 rounded-xl overflow-hidden text-left border border-white/5 text-[11px] mt-2">
      <thead>
        <tr class="border-b border-white/5 bg-white/5">
          <th class="p-2 text-white font-semibold">Risk Score</th>
          <th class="p-2 text-white font-semibold">Eligibility Action</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-white/5">
        <tr>
          <td class="p-2 font-mono text-emerald-400 font-bold">&gt;= 700</td>
          <td class="p-2 text-slate-300">Low Risk — Standard Approval Flow</td>
        </tr>
        <tr>
          <td class="p-2 font-mono text-amber-400 font-bold">650 - 699</td>
          <td class="p-2 text-slate-300">Moderate Risk — Regular verification of banking statement logs required</td>
        </tr>
        <tr>
          <td class="p-2 font-mono text-orange-400 font-bold">600 - 649</td>
          <td class="p-2 text-slate-300">High Risk — Personal guarantee of active managing director mandatory</td>
        </tr>
        <tr>
          <td class="p-2 font-mono text-red-500 font-bold">&lt; 600</td>
          <td class="p-2 text-slate-300">Exorbitant Risk — Auto-decline unless authorized by branch vice-president</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="bg-red-950/20 border border-red-500/20 p-3.5 rounded-2xl flex items-start gap-3">
    <div class="mt-0.5">⚠️</div>
    <div>
      <span class="font-bold text-red-400 block uppercase text-[10px] tracking-wider">Restricted Penalty Notice</span>
      <p class="text-[11px] text-slate-300 mt-0.5 leading-normal">Bypassing these credit limits without secondary corporate manager sign-offs constitutes a compliance breach and is logged in the system audit registry.</p>
    </div>
  </div>
</div>`
  },
  {
    _id: 'risk_appetite_limits',
    title: 'Risk Appetite & Exposure Limits (2026)',
    description: 'Board exposure limits and collateral cover mandates.',
    filename: 'risk_appetite_limits_2026.pdf',
    url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf',
    public_id: 'capitalscale_bank_policies/default_policy_risk',
    size: 24500,
    mimetype: 'application/pdf',
    uploaded_by: 'system',
    uploaded_by_name: 'System Compliance',
    is_system_default: true,
    bank_name: 'System',
    content: `<div class="space-y-4">
  <div class="bg-slate-950 p-4 border border-white/5 rounded-2xl">
    <span class="text-[9px] font-mono text-slate-400">Directive Code: BOARD-RA-2026 │ Issued: Risk Governance Council</span>
    <p class="mt-2 text-slate-200">The Board of Directors has established maximum portfolio exposure caps for the 2026 financial year to safeguard reserves against systemic micro-sector shocks.</p>
  </div>

  <div class="space-y-2">
    <h4 class="font-bold text-slate-200 text-sm">1. Exposure Caps and Approvals</h4>
    <p>Portfolio concentration rules enforce limits on single corporate business exposures:</p>
    <ul class="list-disc pl-5 space-y-1.5 text-slate-300">
      <li><strong class="text-white">Single SME Limit:</strong> The maximum aggregate exposure to a single SME entity is <span class="text-white">₹25,000,000 (2.5 Crores INR)</span>.</li>
      <li><strong class="text-white">Unsecured Limit:</strong> Unsecured working capital loans are capped at <span class="text-white">₹2,000,000 (20 Lakhs INR)</span> per SME.</li>
    </ul>
  </div>

  <div class="space-y-2">
    <h4 class="font-bold text-slate-200 text-sm">2. Collateral Vetting Protocol</h4>
    <p>Secured credit files must satisfy strict collateral appraisal rules:</p>
    <ul class="list-disc pl-5 space-y-1.5 text-slate-300">
      <li><strong class="text-white">Mandatory Limit:</strong> Any application requesting over <span class="text-emerald-400 font-semibold">₹2,500,000 (25 Lakhs INR)</span> must upload a registered collateral agreement file in the "Sanction Letters / Collateral Documents" slot.</li>
      <li><strong class="text-white">Collateral Vetting Ratio:</strong> The appraised value of property/asset collateral must cover at least <span class="text-white">120%</span> of the principal requested.</li>
      <li><strong class="text-white">Verification:</strong> Collateral files must bear a registered notary stamp and title-search clearance report.</li>
    </ul>
  </div>

  <div class="bg-amber-950/20 border border-amber-500/20 p-3.5 rounded-2xl flex items-start gap-3">
    <div class="mt-0.5">⚠️</div>
    <div>
      <span class="font-bold text-amber-400 block uppercase text-[10px] tracking-wider">Collateral Override Conditions</span>
      <p class="text-[11px] text-slate-300 mt-0.5 leading-normal">For CGTMSE (government-guaranteed) backed microloans, collateral is waived up to ₹5,000,000, provided a valid CGTMSE registration certificate is submitted.</p>
    </div>
  </div>
</div>`
  },
  {
    _id: 'kyc_fraud_matrix',
    title: 'Fraud Prevention & KYC Verification Standard',
    description: 'Identity verification criteria and GST audit instructions.',
    filename: 'kyc_fraud_matrix_2026.pdf',
    url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf',
    public_id: 'capitalscale_bank_policies/default_policy_kyc',
    size: 18900,
    mimetype: 'application/pdf',
    uploaded_by: 'system',
    uploaded_by_name: 'System Compliance',
    is_system_default: true,
    bank_name: 'System',
    content: `<div class="space-y-4">
  <div class="bg-slate-950 p-4 border border-white/5 rounded-2xl">
    <span class="text-[9px] font-mono text-slate-400">Directive Code: KYC-COMP-2026 │ Issued: FinCEN Compliance Division</span>
    <p class="mt-2 text-slate-200">Mandatory anti-fraud protocols to verify legal identities and detect financial statement manipulation prior to fund disbursement.</p>
  </div>

  <div class="space-y-2">
    <h4 class="font-bold text-slate-200 text-sm">1. Mandatory Identity Checkpoints</h4>
    <p>All SME files must contain 100% verified KYC uploads in the platform database. Underwriters must cross-reference:</p>
    <ul class="list-disc pl-5 space-y-1.5 text-slate-300">
      <li><strong class="text-white">PAN Card:</strong> Legal business entity name must match the promoter PAN database. Validate active corporate status.</li>
      <li><strong class="text-white">Aadhaar Card:</strong> Director identity verification via OTP or physical Aadhaar scan. Date of birth and photo matches must be audited.</li>
      <li><strong class="text-white">GST Certificate:</strong> Verify the GSTIN is active. Check that the reported registration address matches the address stated on the loan request form.</li>
    </ul>
  </div>

  <div class="space-y-2">
    <h4 class="font-bold text-slate-200 text-sm">2. Document Validation Audit Rules</h4>
    <p>To prevent fraudulent applications using edited PDF files, apply these visual checks:</p>
    <ul class="list-disc pl-5 space-y-1.5 text-slate-300">
      <li><strong class="text-white">Bank Statement Audit:</strong> Cross-check opening and closing balances across monthly cycles. Look for irregular rounded transaction amounts.</li>
      <li><strong class="text-white">ITR and Profit & Loss Audit:</strong> Validate that the sales revenue declared in Profit & Loss statements matches the annual turnover reported in the audited ITR.</li>
    </ul>
  </div>

  <div class="bg-red-950/20 border border-red-500/20 p-3.5 rounded-2xl flex items-start gap-3">
    <div class="mt-0.5">⚠️</div>
    <div>
      <span class="font-bold text-red-400 block uppercase text-[10px] tracking-wider">Discrepancy Reporting</span>
      <p class="text-[11px] text-slate-300 mt-0.5 leading-normal">Any mismatch exceeding 5% between the GST ledger and ITR filings must be flagged as "Missing Information" for clarification, and the audit history log must state "Revenue Discrepancy Audited".</p>
    </div>
  </div>
</div>`
  },
];

const seedPolicies = async () => {
  try {
    console.log('🔄 Connecting to database to seed credit policies...');
    await connectDB();

    for (const item of DEFAULTS) {
      let doc = await BankPolicyDocument.findById(item._id);
      if (!doc) {
        doc = await BankPolicyDocument.create(item);
        console.log(`+ Seeded default policy: ${item.title}`);
      } else {
        // Update URL/description/content if they already exist
        doc.url = item.url;
        doc.description = item.description;
        doc.content = item.content;
        await doc.save();
        console.log(`~ Updated default policy: ${item.title}`);
      }
    }
    console.log('✅ Default policies seeded successfully!');
  } catch (error) {
    console.error('❌ Seeding policies failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🛑 Database connection closed.');
    process.exit(0);
  }
};

seedPolicies();
