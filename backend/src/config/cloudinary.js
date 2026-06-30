import { v2 as cloudinary } from 'cloudinary';

import env from './env.js';
import logger from '../utils/logger.js';






let _initialized = false;

export const initCloudinary = () => {
  if (_initialized) {
    return;
  }

  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    logger.warn('⚠️  Cloudinary credentials not configured — file uploads will be unavailable');
    return;
  }

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  _initialized = true;
  logger.info('✅  Cloudinary initialized');
};

export { cloudinary };
