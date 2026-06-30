import express from 'express';






const router = express.Router();


router.get('/', (_req, res) => {
  res.json({ message: 'List users — not yet implemented' });
});


router.get('/:id', (_req, res) => {
  res.json({ message: `Get user ${_req.params.id} — not yet implemented` });
});


router.patch('/:id', (_req, res) => {
  res.json({ message: `Update user ${_req.params.id} — not yet implemented` });
});


router.delete('/:id', (_req, res) => {
  res.json({ message: `Delete user ${_req.params.id} — not yet implemented` });
});

export default router;
