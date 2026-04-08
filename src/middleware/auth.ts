import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  farmerId?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { farmerId: string };
    req.farmerId = decoded.farmerId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
