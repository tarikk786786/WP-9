module.exports = {
  apps: [
    {
      name: 'whatsapp-worker',
      script: 'npm',
      args: 'run live',
      cwd: __dirname,
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        WORKER_PORT: 8788,
      },
      restart_delay: 2500,
      max_memory_restart: '600M',
      autorestart: true,
      watch: false,
      instances: 1,
    },
  ],
};
