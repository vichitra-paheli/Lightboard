#!/usr/bin/env node

/**
 * Kills all running Lightboard dev servers and stops Docker infrastructure.
 * Cross-platform: works on Windows, macOS, and Linux.
 *
 * Usage: pnpm cleanup
 */

import { execSync } from 'child_process';

const PORTS = [3000, 3001];

function log(msg) {
  console.log(`[cleanup] ${msg}`);
}

// 1. Stop Docker containers
try {
  execSync('docker compose down', { stdio: 'pipe', cwd: process.cwd() });
  log('Docker containers stopped.');
} catch {
  log('No Docker containers to stop (or docker not available).');
}

// 2. Kill processes on dev server ports
const isWindows = process.platform === 'win32';

for (const port of PORTS) {
  try {
    if (isWindows) {
      const output = execSync(`netstat -ano | findstr :${port}.*LISTENING`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pids = new Set(
        output
          .split('\n')
          .filter((line) => line.includes('LISTENING'))
          .map((line) => line.trim().split(/\s+/).pop())
          .filter(Boolean),
      );
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
          log(`Killed process ${pid} on port ${port}.`);
        } catch {}
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'pipe' });
      log(`Killed process on port ${port}.`);
    }
  } catch {
    // No process on this port — that's fine
  }
}

log('All clean.');
