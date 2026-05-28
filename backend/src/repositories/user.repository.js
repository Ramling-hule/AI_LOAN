// ---------------------------------------------------------------------------
// User Repository — placeholder
// Data access layer: ONLY Mongoose queries here. No business logic.
// ---------------------------------------------------------------------------

const UserRepository = {
  async findAll(_filters = {}) {
    throw new Error('UserRepository.findAll — not yet implemented');
  },
  async findById(_id) {
    throw new Error('UserRepository.findById — not yet implemented');
  },
  async findByEmail(_email) {
    throw new Error('UserRepository.findByEmail — not yet implemented');
  },
  async create(_data) {
    throw new Error('UserRepository.create — not yet implemented');
  },
  async updateById(_id, _data) {
    throw new Error('UserRepository.updateById — not yet implemented');
  },
  async deleteById(_id) {
    throw new Error('UserRepository.deleteById — not yet implemented');
  },
};

export default UserRepository;
