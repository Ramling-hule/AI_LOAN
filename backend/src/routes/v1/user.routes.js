import express from 'express';

// ---------------------------------------------------------------------------
// User routes — v1
// Placeholder for user management endpoints.
// ---------------------------------------------------------------------------

const router = express.Router();

// GET  /api/v1/users
router.get('/', (_req, res) => {
  res.json({ message: 'List users — not yet implemented' });
});

// GET  /api/v1/users/:id
router.get('/:id', (_req, res) => {
  res.json({ message: `Get user ${_req.params.id} — not yet implemented` });
});

// PATCH /api/v1/users/:id
router.patch('/:id', (_req, res) => {
  res.json({ message: `Update user ${_req.params.id} — not yet implemented` });
});

// DELETE /api/v1/users/:id
router.delete('/:id', (_req, res) => {
  res.json({ message: `Delete user ${_req.params.id} — not yet implemented` });
});

export default router;
