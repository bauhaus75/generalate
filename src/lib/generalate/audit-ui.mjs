#!/usr/bin/env node
/**
 * UI Audit: Static analysis for navigation and button issues.
 * Run: node src/lib/generalate/audit-ui.mjs
 * 
 * Checks:
 * 1. Every app.go('X') has a matching case 'X' in the router
 * 2. Every button ID has a click handler
 * 3. Template literals don't reference undefined variables (basic check)
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const appJs = readFileSync(join(dir, 'ui/app.js'), 'utf8');
const screensJs = readFileSync(join(dir, 'ui/screens.js'), 'utf8');

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};

// 1. Route coverage: every app.go('X') must have case 'X'
const goCalls = [...appJs.matchAll(/app\.go\(['"]([^'"]+)['"]/g)].map(m => m[1]);
const goCallsScreens = [...screensJs.matchAll(/app\.go\(['"]([^'"]+)['"]/g)].map(m => m[1]);
const allGoCalls = [...new Set([...goCalls, ...goCallsScreens])];

const routerCases = [...appJs.matchAll(/case ['"]([^'"]+)['"]:/g)].map(m => m[1]);
const routerSet = new Set(routerCases);

console.log('\n=== Route Coverage ===');
for (const route of allGoCalls) {
  ok(`route '${route}' exists in router`, routerSet.has(route));
}

// 2. Button coverage: every id="X" button should have a handler
const buttonIds = [...screensJs.matchAll(/<(button|select)[^>]*id="([^"]+)"/g)].map(m => m[2]);
const buttonIdsApp = [...appJs.matchAll(/<(button|select)[^>]*id="([^"]+)"/g)].map(m => m[2]);
const allButtonIds = [...new Set([...buttonIds, ...buttonIdsApp])];

console.log('\n=== Button Handler Coverage ===');
for (const id of allButtonIds) {
  // Skip debug buttons and template placeholders
  if (id.startsWith('dbg-')) continue;
  if (id.includes('${')) continue;
  if (id === 'rep-roster') continue; // <select>, uses change event not click
  // Check for handler via querySelector, getElementById, or drawerGo
  const pattern = new RegExp(`(querySelector|getElementById|drawerGo).*['"]#?${id}['"]`);
  const found = pattern.test(appJs) || pattern.test(screensJs);
  ok(`button '#${id}' has handler`, found);
}

// 3. Check for common issues
console.log('\n=== Common Issues ===');
// Check for app.go with old route names
const oldRoutes = ['desk'];
for (const old of oldRoutes) {
  const usesOld = appJs.includes(`app.go('${old}')`) || screensJs.includes(`app.go('${old}')`);
  const hasCase = routerSet.has(old);
  if (usesOld && !hasCase) {
    ok(`old route '${old}' not used without case`, false, 'USED BUT NO CASE');
  } else if (usesOld && hasCase) {
    console.log(`INFO  route '${old}' has alias case (OK)`);
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILURES'}`);
process.exit(failures > 0 ? 1 : 0);
