const env = require('./config/env');
const db = require('./config/db');
const { createApp } = require('./app');

const server = createApp().listen(env.PORT, () => {
  console.log(JSON.stringify({ level: 'info', msg: `API démarrée sur le port ${env.PORT}`, env: env.NODE_ENV }));
});

async function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', msg: `${signal} reçu, arrêt en cours` }));
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
