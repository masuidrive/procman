module.exports = {
  apps: [
    {
      name: "test-app-1",
      script: "./tests/fixtures/test-process.js",
      cwd: "./",
      namespace: "test",
      max_memory_restart: "50M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "test-app-1"
      }
    },
    {
      name: "test-app-2", 
      script: "./tests/fixtures/test-process.js",
      cwd: "./",
      namespace: "test",
      max_memory_restart: "30M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "test-app-2"
      }
    },
    {
      name: "memory-eater",
      script: "./tests/e2e/fixtures/memory-eater",
      args: "3 25",
      cwd: "./",
      namespace: "stress-test",
      max_memory_restart: "20M",
      env: {
        NODE_ENV: "test",
        TEST_APP: "memory-eater"
      }
    }
  ]
};