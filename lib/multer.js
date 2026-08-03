import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileTypeFromFile } from 'file-type';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const ALL_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES]);
const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv']);
const LEGACY_OFFICE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
]);

const CANONICAL_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.ms-excel', '.xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['text/csv', '.csv'],
  ['application/csv', '.csv'],
  ['application/vnd.ms-powerpoint', '.ppt'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'],
]);

const removeUploadedFiles = async (files = []) => {
  await Promise.all(files.map(file => file?.path
    ? fs.unlink(file.path).catch(() => {})
    : undefined));
};

const looksLikeCsv = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) return false;

  const text = buffer.toString('utf8');
  if (text.includes('\uFFFD')) return false;

  const firstNonEmptyLine = text.split(/\r?\n/).find(line => line.trim());
  return Boolean(firstNonEmptyLine && /[,;\t]/.test(firstNonEmptyLine));
};

const validateUploadedFiles = allowedMimeTypes => async (req, _res, next) => {
  const files = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files || {}).flat();

  try {
    for (const file of files) {
      const detected = await fileTypeFromFile(file.path);
      let actualMime = detected?.mime;

      if (!actualMime && CSV_MIME_TYPES.has(file.mimetype) && await looksLikeCsv(file.path)) {
        actualMime = 'text/csv';
      }

      // Legacy DOC/XLS/PPT files share the OLE compound-file signature.
      if (detected?.mime === 'application/x-cfb' && LEGACY_OFFICE_MIME_TYPES.has(file.mimetype)) {
        actualMime = file.mimetype;
      }

      if (!actualMime || !allowedMimeTypes.has(actualMime)) {
        const error = new multer.MulterError('INVALID_FILE_CONTENT', file.fieldname);
        error.message = 'Uploaded file content does not match an allowed file type.';
        throw error;
      }

      const canonicalExtension = CANONICAL_EXTENSIONS.get(actualMime);
      if (canonicalExtension && path.extname(file.filename).toLowerCase() !== canonicalExtension) {
        const nextFilename = `${path.basename(file.filename, path.extname(file.filename))}${canonicalExtension}`;
        const nextPath = path.join(path.dirname(file.path), nextFilename);
        await fs.rename(file.path, nextPath);
        file.filename = nextFilename;
        file.path = nextPath;
      }

      file.mimetype = actualMime;
    }

    next();
  } catch (error) {
    await removeUploadedFiles(files);
    next(error);
  }
};

const secureUpload = (options, allowedMimeTypes) => {
  const instance = multer(options);
  return {
    any: (...args) => [
      instance.any(...args),
      validateUploadedFiles(allowedMimeTypes),
    ],
  };
};

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = crypto.randomUUID();
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter - accept images and documents
const fileFilter = (req, file, cb) => {
  // Allowed mime types for images and documents
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image and document files are allowed!'), false);
  }
};

const imageOnly = (req, file, cb) => {
  // Allowed mime types for images and documents
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Create multer instance
const upload = secureUpload({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}, ALL_MIME_TYPES);

// Custom storage for events - stores in uploads/event/ with unique filename
const eventStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/event/'));
  },
  filename: function (req, file, cb) {
    // Generate unique filename: event-{timestamp}-{random}-{originalname}
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `event-${uniqueSuffix}${ext}`);
  }
});

const licenseStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/license/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `license-${uniqueSuffix}${ext}`);
  }
})

const ielpStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/ielp/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `ielp-${uniqueSuffix}${ext}`);
  }
})

const logbookUser = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/logbookUser/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `logbookUser-${uniqueSuffix}${ext}`);
  }
})

const medexStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/medex/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `medex-${uniqueSuffix}${ext}`);
  }
})

const competenceStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/competence/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `competence-${uniqueSuffix}${ext}`);
  }
})

const roomStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/room/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `room-${uniqueSuffix}${ext}`);
  }
})

const essayStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/essay/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `essay-${uniqueSuffix}${ext}`);
  }
})

const multipleChoice = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/multipleChoice/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `multipleChoice-${uniqueSuffix}${ext}`);
  }
})

const practicalTest = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/practicalTest/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `practicalTest-${uniqueSuffix}${ext}`);
  }
})

const preview = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/preview/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    const captureType = file.fieldname === 'screenFile'
      ? 'screen'
      : file.fieldname === 'cameraFile'
        ? 'camera'
        : null;
    cb(null, `preview${captureType ? `-${captureType}` : ''}-${uniqueSuffix}${ext}`);
  }
})

const briefingStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/briefing/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `briefing-${uniqueSuffix}${ext}`);
  }
})

const csvStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(file.originalname) || '.csv';
    cb(null, `csv-${uniqueSuffix}${ext}`);
  }
})

// Create multer instance for events
const uploadEvent = secureUpload({
  storage: eventStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES);

// Create multer instance for events
const uploadLicense = secureUpload({
  storage: licenseStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES);

const uploadIelp = secureUpload({
  storage: ielpStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES);

const uploadMedex = secureUpload({
  storage: medexStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES)

const uploadCompetence = secureUpload({
  storage: competenceStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES)

const uploadlogbookUser = secureUpload({
  storage: logbookUser,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES)

const uploadRoom = secureUpload({
  storage: roomStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES)

const uploadEssay = secureUpload({
  storage: essayStorage,
  fileFilter: imageOnly,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, IMAGE_MIME_TYPES)

const uploadMultipleChoice = secureUpload({
  storage: multipleChoice,
  fileFilter: imageOnly,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, IMAGE_MIME_TYPES)

const uploadPracticalTest = secureUpload({
  storage: practicalTest,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, ALL_MIME_TYPES)

const uploadPreview = secureUpload({
  storage: preview,
  fileFilter: imageOnly,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2
  }
}, IMAGE_MIME_TYPES)

const uploadBriefing = secureUpload({
  storage: briefingStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
}, ALL_MIME_TYPES)

const csvOnly = (req, file, cb) => {
  const allowedMimeTypes = [
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel'
  ];

  if (
    allowedMimeTypes.includes(file.mimetype) ||
    path.extname(file.originalname).toLowerCase() === '.csv'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed!'), false);
  }
};

const uploadCsv = secureUpload({
  storage: csvStorage,
  fileFilter: csvOnly,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
}, new Set(['text/csv']))

export default upload;
export {
  uploadEvent,
  uploadLicense,
  uploadIelp,
  uploadMedex,
  uploadCompetence,
  uploadlogbookUser,
  uploadRoom,
  uploadEssay,
  uploadMultipleChoice,
  uploadPracticalTest,
  uploadPreview,
  uploadBriefing,
  uploadCsv,
  validateUploadedFiles,
};
