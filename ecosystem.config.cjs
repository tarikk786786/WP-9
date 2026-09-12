const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'whatsapp-worker',
      script: path.resolve(__dirname, 'apps/worker/src/guard.ts'),
      node_args: '--import tsx',
      interpreter: 'node',
      exec_mode: 'fork',
      cwd: __dirname,
      windowsHide: true,
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
