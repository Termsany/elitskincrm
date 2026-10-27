import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export const createSessionToken = () => randomBytes(32).toString('hex');
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');
