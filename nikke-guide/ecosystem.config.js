module.exports = {
  apps: [
    {
      name: "nikke-guide",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3101",
      cwd: "/Users/namwook/Documents/namukeu/nikke-guide",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      max_restarts: 5,
      env: {
        NODE_ENV: "production",
        PORT: "3101",
      },
    },
  ],
};
