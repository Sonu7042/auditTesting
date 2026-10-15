const { Prisma } = require("@prisma/client");

const getStatusCode = (error) => {
  if (error.statusCode) return error.statusCode;
  if (error.status) return error.status;
  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    return 401;
  }
  if (error.name === "MulterError") {
    return 400;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return 409;
    if (error.code === "P2025") return 404;
  }
  return 500;
};

const getMessage = (error, statusCode) => {
  if (error.name === "MulterError") {
    return error.message || "File upload failed";
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "Duplicate record already exists";
    if (error.code === "P2025") return "Requested record was not found";
  }
  if (statusCode >= 500 && process.env.NODE_ENV === "production") {
    return "Internal server error";
  }
  return error.message || "Something went wrong";
};

const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = getStatusCode(error);
  const response = {
    success: false,
    message: getMessage(error, statusCode),
  };

  if (error.errors) {
    response.errors = error.errors;
  }

  if (process.env.NODE_ENV !== "production") {
    response.stack = error.stack;
  }

  console.error(error);
  return res.status(statusCode).json(response);
};

module.exports = {
  errorHandler,
  notFound,
};
