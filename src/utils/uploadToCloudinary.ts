import cloudinary from "../config/cloudinary";

export function uploadToCloudinary(
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const b64 = buffer.toString("base64");
    const dataURI = `data:${mimetype};base64,${b64}`;
    cloudinary.uploader.upload(
      dataURI,
      { folder: "ecommerce" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result!.secure_url);
      },
    );
  });
}
