const env = require('../config/env');

module.exports = (req, res, next) => {
  if (env.NODE_ENV === 'test') return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(JSON.stringify({
      level: 'info', requestId: req.id, method: req.method, url: req.originalUrl,
      status: res.statusCode, ms: Math.round(ms), userId: req.user ? req.user.id : undefined,
    }));
  });
  next();
};
