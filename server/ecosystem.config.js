module.exports = {
  apps: [
    {
      name: "stratix-ws-server",
      script: "index.js",
      watch: false,
      restart_delay: 5000,
      max_restarts: 50,
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
    },
  ],
};
