module.exports = {
  apps: [
    {
      name: "ai-blog",
      script: "node_modules/.bin/next",
      args: "start -p 3100",
      cwd: "/Users/namwook/Documents/namukeu/ai-blog",
      env: {
        NODE_ENV: "production",
      },
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
    },
  ],
};
