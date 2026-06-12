import 'dotenv/config';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { connectDB } from '../config/db.js';
import LoanService from '../services/loan.service.js';
import { Loan, SMEUser, BankAdminUser, Role } from '../models/index.js';

const run = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await connectDB();

    console.log('🔄 Fetching/Creating Roles...');
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

    const hashedPassword = await argon2.hash('password123');

    console.log('🔄 Upserting test users with valid Argon2 hashes...');
    // Create/update dummy SME
    let sme = await SMEUser.findOne({ email: 'test-sme@transition.com' });
    if (!sme) {
      sme = await SMEUser.create({
        full_name: 'Test SME Applicant',
        email: 'test-sme@transition.com',
        phone: '+919999999999',
        password_hash: hashedPassword,
        role_id: smeRole._id,
        business_name: 'Test SME Ventures',
      });
      console.log('+ Created test SME user');
    } else {
      sme.password_hash = hashedPassword;
      await sme.save();
      console.log('~ Updated test SME user password');
    }

    // Create/update dummy Admin
    let admin = await BankAdminUser.findOne({ email: 'test-admin@transition.com' });
    if (!admin) {
      admin = await BankAdminUser.create({
        admin_name: 'Test Bank Officer',
        email: 'test-admin@transition.com',
        phone: '+918888888888',
        password_hash: hashedPassword,
        role_id: adminRole._id,
        bank_name: 'State Bank of India',
        branch_name: 'Bandra Main',
        ifsc_code: 'SBIN0000300',
      });
      console.log('+ Created test Admin user');
    } else {
      admin.password_hash = hashedPassword;
      await admin.save();
      console.log('~ Updated test Admin user password');
    }

    console.log('🔄 Creating a fresh loan draft...');
    const draft = await LoanService.createDraft(sme._id, { bank_name: 'State Bank of India' });
    console.log(`+ Draft created: ${draft.appId} (Status: ${draft.status})`);

    // Populate minimal required details
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
      pan: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'pan.pdf', mimetype: 'application/pdf', size: 1024 },
      aadhaar: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'aadhaar.pdf', mimetype: 'application/pdf', size: 1024 },
      gst_certificate: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'gst.pdf', mimetype: 'application/pdf', size: 1024 },
      bank_statements: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'bank.pdf', mimetype: 'application/pdf', size: 1024 },
      itr: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'itr.pdf', mimetype: 'application/pdf', size: 1024 },
      balance_sheets: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'balance.pdf', mimetype: 'application/pdf', size: 1024 },
      profit_loss: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'pl.pdf', mimetype: 'application/pdf', size: 1024 },
      loan_documents: { url: 'https://res.cloudinary.com/dqunwvard/image/upload/v1779975706/capitalscale_bank_policies/default_policy_doc.pdf', filename: 'sanction.pdf', mimetype: 'application/pdf', size: 1024 },
    };
    await draft.save();

    console.log('🔄 Submitting application (draft -> submitted)...');
    const submitted = await LoanService.submitLoanApplication(sme._id, draft._id);
    console.log(`✅ Loan application created and submitted!`);
    console.log(`Loan ID: ${submitted._id}`);
    console.log(`App ID: ${submitted.appId}`);
    console.log(`Status: ${submitted.status}`);

  } catch (error) {
    console.error('❌ Error creating test loan:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🛑 Database connection closed.');
    process.exit(0);
  }
};

run();
