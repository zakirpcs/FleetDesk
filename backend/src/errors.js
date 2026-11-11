// Errors carry a message written for the end user: the UI shows `message` as-is.
export class ApiError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = () => new ApiError('Record not found', 404);

// Last-resort translation of a constraint the application checks did not catch,
// so the user still gets a sentence instead of a Postgres code.
const PG = {
  '23505': ['That value is already used by another record', 409],
  '23503': ['Another record still refers to this one', 409],
  '23502': ['A required value was left out', 400],
  '23514': ['Some of the values are out of the allowed range', 400],
  '22007': ['A date or time was not in the expected format', 400],
  '22P02': ['A number or date was not in the expected format', 400],
};

export function errorHandler(err, req, res, _next) {
  let { status, message, details } = err;
  if (!status && PG[err.code]) [message, status] = PG[err.code];
  status ||= 500;
  if (status >= 500) console.error(`${req.method} ${req.originalUrl}`, err);
  res.status(status).json({
    message: status >= 500 ? 'The server could not complete that request. Please try again.' : message,
    details: details || undefined,
  });
}
