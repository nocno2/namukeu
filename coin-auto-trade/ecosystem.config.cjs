module.exports = {
  apps: [
    {
      name: "coin-auto-trade",
      script: ".venv/bin/python",
      args: "-m src.main",
      cwd: "/Users/namwook/Documents/namukeu/coin-auto-trade",
      env_file: ".env",
      log_file: "data/logs/pm2.log",
      error_file: "data/logs/pm2-error.log",
      out_file: "data/logs/pm2-out.log",
      merge_logs: true,
      max_restarts: 3,
      restart_delay: 5000,
    },
  ],
};
