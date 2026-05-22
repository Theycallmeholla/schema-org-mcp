#!/usr/bin/env node
/**
 * Generates build-info.ts with runtime fingerprint data.
 * Run before build to capture git SHA, branch, and timestamp.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const buildInfo = {
  version: getPackageVersion(),
  gitSha: exec('git rev-parse --short HEAD'),
  gitBranch: exec('git rev-parse --abbrev-ref HEAD'),
  buildTime: new Date().toISOString(),
  nodeVersion: process.version,
};

const content = `/**
 * Build information for runtime fingerprinting.
 * AUTO-GENERATED - DO NOT EDIT
 * Generated: ${buildInfo.buildTime}
 */

export interface BuildInfo {
  version: string;
  gitSha: string;
  gitBranch: string;
  buildTime: string;
  nodeVersion: string;
}

export const BUILD_INFO: BuildInfo = ${JSON.stringify(buildInfo, null, 2)};
`;

const outPath = join(__dirname, '..', 'src', 'build-info.ts');
writeFileSync(outPath, content);

console.error(`Build info generated: v${buildInfo.version} (${buildInfo.gitSha})`);
