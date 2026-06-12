import crypto from 'crypto';

export const generateCsrfToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Middleware to set a CSRF cookie if it doesn't already exist.
 * This can be used as a global middleware or on initial visits.
 */
export const setCsrfCookie = (req, res, next) => {
  if (!req.cookies?.csrfToken) {
    const token = generateCsrfToken();
    res.cookie('csrfToken', token, {
      httpOnly: false, // Allowed to be read by client JS to attach in request headers
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  next();
};

/**
 * Middleware to verify that the incoming X-CSRF-Token header
 * matches the csrfToken cookie. Applied to state-mutating requests.
 */
export const verifyCsrf = (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Bypass CSRF checks for public authentication entry endpoints
  const bypassUrls = [
    '/api/v1/auth/sme/login',
    '/api/v1/auth/sme/register',
    '/api/v1/auth/bank/login',
    '/api/v1/auth/bank/register',
    '/api/v1/auth/mfa/verify',
    '/api/v1/auth/refresh'
  ];

  if (bypassUrls.some(url => req.originalUrl.startsWith(url))) {
    return next();
  }

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed. Missing or invalid CSRF token.',
    });
  }

  next();
};
