#!/usr/bin/env node

/**
 * Post-build syntax checker for AgentArena
 *
 * This script validates the build output (dist/app.js) for common syntax errors.
 * It runs after `pnpm build` via the `postbuild` hook.
 *
 * Usage: node scripts/check-syntax.js
 * Exit code: 0 if no issues, 1 if issues found
 */

const fs = require('fs');
const path = require('path');

const DIST_APP_JS = path.join(__dirname, '..', 'apps', 'web-report', 'dist', 'app.js');

console.log('🔍 Checking build output for syntax errors...\n');

if (!fs.existsSync(DIST_APP_JS)) {
  console.error(`❌ Build output not found: ${DIST_APP_JS}`);
  console.error('   Run `pnpm build` first.\n');
  process.exit(1);
}

const content = fs.readFileSync(DIST_APP_JS, 'utf8');

// Check for syntax errors in the built output
const checks = [
  {
    name: 'SyntaxError markers',
    test: () => {
      const patterns = [
        /SyntaxError:/i,
        /Unexpected token/i,
        /Unexpected identifier/i,
        /Unexpected character/i
      ];
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          return `Found syntax error marker: ${pattern.source}`;
        }
      }
      return null;
    }
  },
  {
    name: 'Empty file',
    test: () => content.trim().length === 0 ? 'app.js is empty' : null
  },
  {
    name: 'File size',
    test: () => {
      const size = content.length;
      if (size < 1000) {
        return `app.js is suspiciously small (${size} bytes)`;
      }
      return null;
    }
  }
];

const errors = [];
for (const check of checks) {
  const error = check.test();
  if (error) {
    errors.push({ name: check.name, error });
  }
}

if (errors.length > 0) {
  console.error('❌ Syntax checks failed:\n');
  for (const { name, error } of errors) {
    console.error(`  ${name}: ${error}`);
  }
  console.error('\n💡 Tips:');
  console.error('   - Look for recently removed code blocks');
  console.error('   - Check if closing brackets were left behind');
  console.error('   - Verify all brackets are properly matched');
  console.error('   - Check template literals for unclosed backticks\n');
  process.exit(1);
}

console.log('✅ Build output looks good - no obvious syntax issues found\n');
process.exit(0);
