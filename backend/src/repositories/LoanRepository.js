import {
  findLoanById, setLoanDocument, findLoanByAppId, updateLoanDraft, updateLoanUnderwritingAssessment, createStatusHistory
} from '../db/queries/loans.queries.js';

class LoanRepository {
  async findById(loanId) {
    return findLoanById(loanId);
  }

  async findByAppId(appId) {
    return findLoanByAppId(appId);
  }

  async setDocument(loanId, docType, docData) {
    return setLoanDocument(loanId, docType, docData);
  }

  async updateDraft(loanId, updates) {
    return updateLoanDraft(loanId, updates);
  }

  async updateUnderwritingAssessment(loanId, assessment, riskScore) {
    return updateLoanUnderwritingAssessment(loanId, assessment, riskScore);
  }

  async addStatusHistory(historyData) {
    return createStatusHistory(historyData);
  }
}

export default new LoanRepository(); 
