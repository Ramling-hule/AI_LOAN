// ---------------------------------------------------------------------------
// Loan Repository — placeholder
// ---------------------------------------------------------------------------

const LoanRepository = {
  async findAll(_filters = {}) {
    throw new Error('LoanRepository.findAll — not yet implemented');
  },
  async findById(_id) {
    throw new Error('LoanRepository.findById — not yet implemented');
  },
  async findByApplicantId(_applicantId) {
    throw new Error('LoanRepository.findByApplicantId — not yet implemented');
  },
  async create(_data) {
    throw new Error('LoanRepository.create — not yet implemented');
  },
  async updateById(_id, _data) {
    throw new Error('LoanRepository.updateById — not yet implemented');
  },
  async deleteById(_id) {
    throw new Error('LoanRepository.deleteById — not yet implemented');
  },
};

export default LoanRepository;
