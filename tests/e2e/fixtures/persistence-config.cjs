module.exports = {
  apps: [
    {
      name: "persistent-app-1",
      script: "./tests/fixtures/test-process.js",
      cwd: "./",
      namespace: "persistent",
      max_memory_restart: "100M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "persistent-app-1"
      }
    },
    {
      name: "persistent-app-2",
      script: "./tests/fixtures/test-process.js", 
      cwd: "./",
      namespace: "persistent",
      max_memory_restart: "100M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "persistent-app-2"
      }
    }
  ]
};