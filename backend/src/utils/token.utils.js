import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import env from '../config/env.js';









export const generateAccessToken = (payload, sessionId) => {
  return jwt.sign(
    { ...payload, sessionId },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
      jwtid: uuidv4(),
    }
  );
};


export const generateRefreshToken = (payload, jti = uuidv4()) => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    jwtid: jti,
  });
};


export const generateMfaToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '5m',
    jwtid: uuidv4(),
  });
};


export const verifyMfaToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};


export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};


export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};


export const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,                           
    secure: env.NODE_ENV === 'production',    
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,        
    path: '/api/v1/auth',                     
  });
};


export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/api/v1/auth',
  });
};


export const buildTokenPayload = (user, type) => ({
  id: user.id,        
  email: user.email,
  role: type,
  role_id: user.role_id,
  bank_name: user.bank_name,
  admin_name: user.admin_name,
  business_name: user.business_name,
});


export const sanitizeUser = (user, type) => {
  const obj = { ...user };   
  delete obj.password_hash;
  obj.type = type;
  obj.role = type;
  return obj;
};
