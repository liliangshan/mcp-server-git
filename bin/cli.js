#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get the server file path
const serverPath = path.join(__dirname, '..', 'src', 'server-final.js');

// Spawn the server process
const server = spawn('node', [serverPath], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: process.cwd()
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