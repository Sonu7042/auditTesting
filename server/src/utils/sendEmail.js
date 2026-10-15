const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, 
  },
});

exports.sendEmail = async (
  emails,
  subject,
  message,
  { throwOnError = false } = {}
) => {
  try {
    const info = await transporter.sendMail({
      from: `"Audit Portal" <${process.env.EMAIL_USER}>`,
      to: emails.join(","), 
      subject: subject,
      text: message, 
    });

    console.log("Email sent to:", emails);
    return info;
  } catch (error) {
    console.error("Email error:", error);
    if (throwOnError) throw error;
    return null;
  }
};
