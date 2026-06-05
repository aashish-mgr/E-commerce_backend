import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
    destination: function(req,file,cb) {
        const allowedFiletypes = ['image/png', 'image/jpeg','image/jpg'];
        if(!allowedFiletypes.includes(file.mimetype)) {
            cb(new Error("this file type was not supported"), "");
        } else {
            cb(null, './src/uploads');
        }
    },

    filename: function(req,file,cb) {
        const uniqueName = Date.now() + file.originalname;
        cb(null,uniqueName);
    },
    
    
});

export const upload = multer({storage: storage});