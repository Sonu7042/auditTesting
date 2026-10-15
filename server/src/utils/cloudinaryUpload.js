const crypto = require("crypto");
const path = require("path");

const sanitizePublicId = (fileName) => {
  const parsedName = path.parse(fileName || "document").name;

  return (
    parsedName
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "document"
  );
};

const uploadToCloudinary = async (file, folder = "audit-portal") => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const resourceType = file.mimetype === "application/pdf" ? "raw" : "image";
  const publicId =
    resourceType === "raw" ? `${sanitizePublicId(file.originalname)}.pdf` : null;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials are not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = [
    `folder=${folder}`,
    ...(publicId ? [`public_id=${publicId}`] : []),
    `timestamp=${timestamp}`,
  ].join("&");
  const signature = crypto
    .createHash("sha1")
    .update(`${signaturePayload}${apiSecret}`)
    .digest("hex");

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([file.buffer], { type: file.mimetype }),
    file.originalname
  );
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", folder);
  if (publicId) {
    formData.append("public_id", publicId);
  }
  formData.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Cloudinary upload failed");
  }

  return data;
};

module.exports = uploadToCloudinary;
