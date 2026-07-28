import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
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
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Custom storage for events - stores in uploads/event/ with unique filename
const eventStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/event/'));
  },
  filename: function (req, file, cb) {
    // Generate unique filename: event-{timestamp}-{random}-{originalname}
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `event-${uniqueSuffix}${ext}`);
  }
});

const licenseStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/license/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `license-${uniqueSuffix}${ext}`);
  }
})

const ielpStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/ielp/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `ielp-${uniqueSuffix}${ext}`);
  }
})

const logbookUser = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/logbookUser/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `logbookUser-${uniqueSuffix}${ext}`);
  }
})

const medexStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/medex/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `medex-${uniqueSuffix}${ext}`);
  }
})

const competenceStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/competence/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `competence-${uniqueSuffix}${ext}`);
  }
})

const roomStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/room/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `room-${uniqueSuffix}${ext}`);
  }
})

const essayStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/essay/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `essay-${uniqueSuffix}${ext}`);
  }
})

const multipleChoice = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/multipleChoice/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `multipleChoice-${uniqueSuffix}${ext}`);
  }
})

const practicalTest = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/practicalTest/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `practicalTest-${uniqueSuffix}${ext}`);
  }
})

const preview = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/preview/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `briefing-${uniqueSuffix}${ext}`);
  }
})

const csvStorage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function(req,file, cb){
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.csv';
    cb(null, `csv-${uniqueSuffix}${ext}`);
  }
})

// Create multer instance for events
const uploadEvent = multer({ 
  storage: eventStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

// Create multer instance for events
const uploadLicense = multer({ 
  storage: licenseStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

const uploadIelp = multer({ 
  storage: ielpStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

const uploadMedex = multer({
  storage: medexStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

const uploadCompetence = multer({
  storage: competenceStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

const uploadlogbookUser = multer({
  storage: logbookUser,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

const uploadRoom = multer({
  storage: roomStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

const uploadEssay = multer({
  storage: essayStorage,
  fileFilter: imageOnly,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

const uploadMultipleChoice = multer({
  storage: multipleChoice,
  fileFilter: imageOnly,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

const uploadPracticalTest = multer({
  storage: practicalTest,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

const uploadPreview = multer({
  storage: preview,
  fileFilter: imageOnly,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2
  }
})

const uploadBriefing = multer({
  storage: briefingStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
})

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

const uploadCsv = multer({
  storage: csvStorage,
  fileFilter: csvOnly,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
})

export default upload;
export { uploadEvent, uploadLicense, uploadIelp, uploadMedex, uploadCompetence, uploadlogbookUser, uploadRoom, uploadEssay, uploadMultipleChoice, uploadPracticalTest, uploadPreview, uploadBriefing, uploadCsv};
