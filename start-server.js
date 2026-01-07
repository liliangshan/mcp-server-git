#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the server file path
const serverPath = path.join(__dirname, 'src', 'server-final.js');

// Check if required environment variables are set
const requiredEnvVars = ['PROJECT_PATH', 'LOCAL_BRANCH', 'REMOTE_BRANCH'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Error: Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`  - ${varName}`);
  });
  console.error('\nPlease set these environment variables before starting the server.');
  console.error('Example:');
  console.error('  export PROJECT_PATH="/path/to/your/project"');
  console.error('  export LOCAL_BRANCH="main"');
  console.error('  export REMOTE_BRANCH="main"');
  console.error('  export REMOTE_NAME="origin"  # optional, defaults to "origin"');
  console.error('  export REPO_NAME="my-repo"   # optional, for identification');
  process.exit(1);
}

// Check if project path exists
const projectPath = process.env.PROJECT_PATH;
if (!fs.existsSync(projectPath)) {
  console.error(`Error: Project path does not exist: ${projectPath}`);
  process.exit(1);
}

// Check if it's a git repository
const gitDir = path.join(projectPath, '.git');
if (!fs.existsSync(gitDir)) {
  console.error(`Error: Not a git repository: ${projectPath}`);
  console.error('Please ensure PROJECT_PATH points to a valid git repository.');
  process.exit(1);
}

console.log('Starting MCP Git Server...');
console.log(`Project Path: ${projectPath}`);
console.log(`Remote Name: ${process.env.REMOTE_NAME || 'origin'}`);
console.log(`Local Branch: ${process.env.LOCAL_BRANCH}`);
console.log(`Remote Branch: ${process.env.REMOTE_BRANCH}`);
console.log(`Git Push Flags: ${process.env.GIT_PUSH_FLAGS || '--progress'}`);
console.log(`Tool Prefix: ${process.env.TOOL_PREFIX || '(none)'}`);
console.log(`Changes File: ${process.env.MCP_CHANGES_FILE || 'pending-changes.json'}`);
if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.SOCKS_PROXY) {
  console.log(`HTTP Proxy: ${process.env.HTTP_PROXY || '(none)'}`);
  console.log(`HTTPS Proxy: ${process.env.HTTPS_PROXY || '(none)'}`);
  console.log(`SOCKS Proxy: ${process.env.SOCKS_PROXY || '(none)'}`);
  if (process.env.NO_PROXY) {
    console.log(`No Proxy: ${process.env.NO_PROXY}`);
  }
}
if (process.env.REPO_NAME) {
  console.log(`Repository Name: ${process.env.REPO_NAME}`);
}

// Spawn the server process
const server = spawn('node', [serverPath], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: process.cwd(),
  env: process.env
});

// Handle server exit
server.on('close', (code) => {
  console.log(`MCP Git Server exited with code ${code}`);
  process.exit(code);
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down server...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down server...');
  server.kill('SIGTERM');
});