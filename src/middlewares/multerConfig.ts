import multer from "multer";
import cloudinary from "../config/cloudinary"
import { CloudinaryStorage } from "multer-storage-cloudinary";

const storage =  new CloudinaryStorage ({
    cloudinary,
    params:async (req,file) => ({
        folder: "ecommerce",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        public_id: `${Date.now()}-${file.originalname}`,

    })
}
);

const upload = multer({storage: storage});

export default upload;


