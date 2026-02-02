import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  apiKey?: string;
}

// Timing-safe string comparison
function secureCompare(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

// API key authentication middleware with timing-safe comparison
export function requireApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header'
    });
    return;
  }

  const token = authHeader.substring(7);
  const validTokens = (process.env.VALID_API_KEYS || '').split(',').filter(t => t.length > 0);

  // Use timing-safe comparison to prevent timing attacks
  const isValid = validTokens.some(validToken =>
    validToken.length === token.length && secureCompare(validToken, token)
  );

  if (!isValid) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
    return;
  }

  // Optional: Track usage per token
  req.apiKey = token;
  next();
}
