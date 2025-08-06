module.exports = {
  apps: [{
    name: 'test-app',
    script: 'node',
    args: '-e "setInterval(() => console.log(new Date().toISOString()), 1000)"'
  }]
};
