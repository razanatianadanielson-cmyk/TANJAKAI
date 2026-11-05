// Transmet les erreurs des handlers async au middleware d'erreurs d'Express 4.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
