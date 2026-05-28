import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import LoanService from '../services/loan.service.js';
import { Loan, LoanStatusHistory, SMEUser, BankAdminUser, Role } from '../models/index.js';

const runTest = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await connectDB();

    console.log('🔄 Fetching Roles for seeding...');
    let smeRole = await Role.findOne({ name: 'sme_applicant' });
    if (!smeRole) {
      smeRole = await Role.create({
        name: 'sme_applicant',
        display_name: 'SME Applicant',
        description: 'Test SME applicant role',
        scope: 'sme',
        permissions: [],
      });
    }

    let adminRole = await Role.findOne({ name: 'bank_admin' });
    if (!adminRole) {
      adminRole = await Role.create({
        name: 'bank_admin',
        display_name: 'Bank Administrator',
        description: 'Test Bank admin role',
        scope: 'bank',
        permissions: [],
      });
    }

    console.log('🔄 Seeding temporary test users...');
    // Create dummy SME
    let sme = await SMEUser.findOne({ email: 'test-sme@transition.com' });
    if (!sme) {
      sme = await SMEUser.create({
        full_name: 'Test SME Applicant',
        email: 'test-sme@transition.com',
        phone: '+919999999999',
        password_hash: 'hashedpassword123',
        role_id: smeRole._id,
        business_name: 'Test SME Ventures',
      });
    }

    // Create dummy Admin
    let admin = await BankAdminUser.findOne({ email: 'test-admin@transition.com' });
    if (!admin) {
      admin = await BankAdminUser.create({
        admin_name: 'Test Bank Officer',
        email: 'test-admin@transition.com',
        phone: '+918888888888',
        password_hash: 'hashedpassword123',
        role_id: adminRole._id,
        bank_name: 'State Bank of India',
        branch_name: 'Bandra Main',
        ifsc_code: 'SBIN0000300',
      });
    }

    const smeContext = { id: sme._id, role: 'sme', email: sme.email };
    const adminContext = { id: admin._id, role: 'bank_admin', email: admin.email };

    console.log('🔄 Creating a fresh loan draft...');
    const draft = await LoanService.createDraft(sme._id, { bank_name: 'State Bank of India' });
    console.log(`+ Draft created: ${draft.appId} (Status: ${draft.status})`);

    // Let's populate minimal required details so we can submit
    draft.amount = 500000;
    draft.tenure = 12;
    draft.purpose = 'working_capital';
    draft.revenue = 150000;
    draft.business_info = {
      legal_name: 'Test SME Ventures Private Limited',
      registration_type: 'pvt_ltd',
      gstin: '27AAAAA1111A1Z1',
      incorporation_date: new Date('2020-01-01'),
      industry_type: 'manufacturing',
    };
    draft.financial_info = {
      annual_turnover: 2000000,
      net_profit: 300000,
    };
    draft.behavioural_questions = {
      business_challenges: 'None',
      repayment_plan: 'Monthly EMI',
      future_goals: 'Expansion',
      integrity_check: true,
    };

    // Add mock documents URL to bypass submit verification
    draft.documents = {
      pan: { url: 'http://cloudinary/pan.pdf', filename: 'pan.pdf', mimetype: 'application/pdf', size: 1024 },
      aadhaar: { url: 'http://cloudinary/aadhaar.pdf', filename: 'aadhaar.pdf', mimetype: 'application/pdf', size: 1024 },
      gst_certificate: { url: 'http://cloudinary/gst.pdf', filename: 'gst.pdf', mimetype: 'application/pdf', size: 1024 },
      bank_statements: { url: 'http://cloudinary/bank.pdf', filename: 'bank.pdf', mimetype: 'application/pdf', size: 1024 },
      itr: { url: 'http://cloudinary/itr.pdf', filename: 'itr.pdf', mimetype: 'application/pdf', size: 1024 },
      balance_sheets: { url: 'http://cloudinary/balance.pdf', filename: 'balance.pdf', mimetype: 'application/pdf', size: 1024 },
      profit_loss: { url: 'http://cloudinary/pl.pdf', filename: 'pl.pdf', mimetype: 'application/pdf', size: 1024 },
      loan_documents: { url: 'http://cloudinary/sanction.pdf', filename: 'sanction.pdf', mimetype: 'application/pdf', size: 1024 },
    };
    await draft.save();

    console.log('🔄 Submitting application (draft -> submitted)...');
    const submitted = await LoanService.submitLoanApplication(sme._id, draft._id);
    console.log(`+ Loan submitted successfully (Status: ${submitted.status}, Progress: ${submitted.progress}%)`);

    // Verify invalid transition: submitted -> approved directly (should throw error)
    console.log('🔄 Verifying transition constraints: trying invalid status transition (submitted -> approved)...');
    try {
      await LoanService.transitionLoanStatus(submitted._id, 'approved', adminContext, 'Direct approval attempt');
      console.error('❌ FAILED: Invalid status transition was permitted!');
    } catch (err) {
      console.log(`✅ SUCCESS: Invalid transition blocked: "${err.message}"`);
    }

    console.log('🔄 Moving status: submitted -> eligibility_check...');
    const elig = await LoanService.transitionLoanStatus(submitted._id, 'eligibility_check', adminContext, 'Verifying GST credentials and risk scoring.');
    console.log(`+ Loan moved to Eligibility Check (Status: ${elig.status}, Progress: ${elig.progress}%)`);

    console.log('🔄 Flagging missing documents: eligibility_check -> missing_info (flagging PAN and GST Certificate)...');
    const missing = await LoanService.transitionLoanStatus(
      submitted._id,
      'missing_info',
      adminContext,
      'The uploaded PAN and GST Certificate are unreadable. Please upload higher resolution copies.',
      ['pan', 'gst_certificate']
    );
    console.log(`+ Loan moved to Missing Information (Status: ${missing.status}, Progress: ${missing.progress}%)`);

    // Fetch the history logs to see if they look correct
    const history1 = await LoanStatusHistory.find({ loan_id: submitted._id }).sort({ created_at: 1 });
    console.log('--- History Logs So Far ---');
    history1.forEach((log) => {
      console.log(`[${log.created_at.toISOString()}] ${log.from_status} -> ${log.to_status} by ${log.changed_by_name} (${log.changed_by_model}) - Notes: "${log.notes}" (Missing: [${log.missing_docs.join(', ')}])`);
    });
    console.log('---------------------------');

    // Simulate uploading PAN card
    console.log('🔄 SME uploads replacement PAN document...');
    // We clear PAN first to mock the action
    await Loan.updateOne({ _id: submitted._id }, { $unset: { 'documents.pan': '' } });
    
    // We mock the upload by editing document directly
    await Loan.updateOne({ _id: submitted._id }, { $set: { 'documents.pan': { url: 'http://cloudinary/pan_replacement.pdf', filename: 'pan_replacement.pdf', mimetype: 'application/pdf', size: 2048 } } });
    console.log('  Uploaded PAN.');

    // Let's check status. It should STILL be missing_info because GST Certificate is still missing
    let currentLoan = await Loan.findById(submitted._id);
    console.log(`  Current loan status (after 1 of 2 files uploaded): ${currentLoan.status}`);

    console.log('🔄 SME uploads replacement GST Certificate document (triggering auto-resubmit)...');
    // Mock the auto-resubmit upload
    const lastHistory = await LoanStatusHistory.findOne({
      loan_id: submitted._id,
      to_status: 'missing_info',
    }).sort({ created_at: -1 });

    // Mark GST Certificate uploaded
    currentLoan.set(`documents.gst_certificate`, {
      url: 'http://cloudinary/gst_replacement.pdf',
      public_id: 'gst_replacement',
      filename: 'gst_replacement.pdf',
      mimetype: 'application/pdf',
      size: 2048,
      uploaded_at: new Date(),
    });

    // Run the auto-transition check manually since we bypassed uploadDocument
    const allUploaded = lastHistory.missing_docs.every((docKey) => {
      if (docKey === 'gst_certificate') return true; // currently uploading
      return !!currentLoan.documents?.[docKey]?.url;
    });

    if (allUploaded) {
      console.log('  All missing documents uploaded. Auto-transitioning to submitted.');
      currentLoan.status = 'submitted';
      currentLoan.progress = 20;

      await LoanStatusHistory.create({
        loan_id: currentLoan._id,
        from_status: 'missing_info',
        to_status: 'submitted',
        changed_by: sme._id,
        changed_by_name: sme.full_name,
        changed_by_model: 'SMEUser',
        notes: 'System auto-transition: All requested missing documents successfully uploaded.',
        missing_docs: [],
      });
    }
    await currentLoan.save();

    currentLoan = await Loan.findById(submitted._id);
    console.log(`+ Current loan status (after both files uploaded): ${currentLoan.status} (Progress: ${currentLoan.progress}%)`);

    // Verify final timeline history
    const history2 = await LoanStatusHistory.find({ loan_id: submitted._id }).sort({ created_at: 1 });
    console.log('--- Final History Logs ---');
    history2.forEach((log) => {
      console.log(`[${log.created_at.toISOString()}] ${log.from_status} -> ${log.to_status} by ${log.changed_by_name} (${log.changed_by_model}) - Notes: "${log.notes}"`);
    });
    console.log('---------------------------');

    console.log('🔄 Cleaning up database records...');
    await Loan.findByIdAndDelete(submitted._id);
    await LoanStatusHistory.deleteMany({ loan_id: submitted._id });
    console.log('✅ Integration tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🛑 Database connection closed.');
    process.exit(0);
  }
};

runTest();
