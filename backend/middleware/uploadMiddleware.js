import multer from "multer";
import path from "path";
import fs from 'fs';

// make sure upload directory exists; avoids ENOENT crashes when first file is saved
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadDir);
    },
    filename(req, file, cb) {
        const ext=path.extname(file.originalname);
        
        const sessionId=req.params.id || 'unknown';
        cb(null, `${sessionId}-${Date.now()}${ext}`);
    },
}); 

const fileFilter = (req, file, cb) => {
    // accept common web audio/video blobs produced by browser recorder
    if (
        file.mimetype.startsWith("audio/") ||
        file.mimetype === "application/octet-stream" ||
        file.mimetype === "video/webm"
    ) {
        cb(null, true);
    } else {
        cb(new Error("Not an audio file"), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 1024 * 1024 * 10 },
});

const uploadSingleAudio = upload.single("audioFile");
export { uploadSingleAudio };