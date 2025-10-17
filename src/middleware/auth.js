// Simple API key authentication middleware
export function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header'
    });
  }

  const token = authHeader.substring(7);
  const validTokens = (process.env.VALID_API_KEYS || '').split(',');

  if (!validTokens.includes(token)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }

  // Optional: Track usage per token
  req.apiKey = token;
  next();
}
