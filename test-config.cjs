module.exports = {
  apps: [
    {
      name: "test-app",
      script: "node",
      args: "-e \"console.log('Hello World'); setTimeout(() => {}, 30000);\""
    }
  ]
};