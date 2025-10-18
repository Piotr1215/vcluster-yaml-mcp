import crypto from 'crypto';

// Timing-safe string comparison
function secureCompare(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// API key authentication middleware with timing-safe comparison
export function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header'
    });
  }

  const token = authHeader.substring(7);
  const validTokens = (process.env.VALID_API_KEYS || '').split(',').filter(t => t.length > 0);

  // Use timing-safe comparison to prevent timing attacks
  const isValid = validTokens.some(validToken =>
    validToken.length === token.length && secureCompare(validToken, token)
  );

  if (!isValid) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }

  // Optional: Track usage per token
  req.apiKey = token;
  next();
}
