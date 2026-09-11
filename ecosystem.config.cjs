const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'whatsapp-worker',
      script: path.resolve(__dirname, 'node_modules/tsx/dist/cli.mjs'),
      args: 'apps/worker/src/guard.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        WORKER_PORT: '8788',
      },
      restart_delay: 2500,
      max_memory_restart: '600M',
      autorestart: true,
      watch: false,
      instances: 1,
    },
  ],
};
