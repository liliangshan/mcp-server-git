#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const parseMultiInstance = (env) => {
  const instances = {};
  const multiInstanceRegex = /^MULTI_INSTANCE\[(\d+)\]\.(\w+)$/;

  for (const [key, value] of Object.entries(env)) {
    const match = key.match(multiInstanceRegex);
    if (match) {
      const index = parseInt(match[1], 10);
      const prop = match[2];
      if (!instances[index]) {
        instances[index] = {};
      }
      instances[index][prop] = value;
    }
  }

  return Object.values(instances).filter(instance =>
    instance.REPO_NAME && instance.PROJECT_PATH
  );
};

const multiInstance = parseMultiInstance(process.env);
const serverFile = multiInstance.length > 0 ? 'server-muit-final.js' : 'server-final.js';
const serverPath = path.join(__dirname, '..', 'src', serverFile);

const serverEnv = {
  ...process.env,
  MULTI_INSTANCE: JSON.stringify(multiInstance)
};

// Spawn the server process
const server = spawn('node', [serverPath], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: process.cwd(),
  env: serverEnv
});

// Handle server exit
server.on('close', (code) => {
  process.exit(code);
});

// Handle termination signals
process.on('SIGINT', () => {
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});