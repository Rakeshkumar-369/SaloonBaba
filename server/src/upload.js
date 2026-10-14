import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { bad, token } from './util.js';

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${token(6)}${ext}`);
  },
});

/** Images (and PDFs for bills) up to 4 MB. */
export const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic)$/.test(file.mimetype) || file.mimetype === 'application/pdf') cb(null, true);
    else cb(bad('Only images or PDF files are allowed'));
  },
});

export const filePath = (file) => (file ? `/uploads/${file.filename}` : null);
