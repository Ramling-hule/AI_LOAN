// ---------------------------------------------------------------------------
// asyncHandler — wraps async route handlers to catch rejected promises
// and forward them to Express's next() error handler.
//
// Usage:
//   router.get('/path', asyncHandler(async (req, res, next) => { ... }))
// ---------------------------------------------------------------------------

/**
 * @param {Function} fn - Async Express route handler
 * @returns {Function}  - Wrapped handler with error forwarding
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
