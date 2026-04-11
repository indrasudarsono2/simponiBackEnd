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
    'image/svg+xml',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  
  if (file.mimetype.startsWith('image/') || allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image and document files are allowed!'), false);
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

export default upload;
export { uploadEvent, uploadLicense, uploadIelp, uploadMedex, uploadCompetence, uploadlogbookUser, uploadRoom};
