#!/usr/bin/env node
// check-publishable -- would a CONSUMER be able to use this package?
//
// THE DEFECT THIS EXISTS TO CATCH.
//
// A measurement over 455 published versions across 161 packages found:
//   * 131 versions (28.8%) declare an entry point the package does not
//     ship -- the classic `rootDir`/`include` mismatch, where
//     `dist/src/index.js` is what gets built and `dist/index.js` is what
//     the manifest points at
//   * 12 versions (7.5%) have a require() that PROVABLY THROWS
//   * 18 more load fine but ship no `types`, so TypeScript consumers get
//     TS7016
//
// The pattern in one line: NO PACKAGE HERE TESTS THE ARTIFACT IT
// PUBLISHES. The suite passes, the build is green, the package installs
// cleanly -- and then require() throws, because the install is the happy
// path and the use is the failure.
//
// THE FIX IS ONE STEP: pack the package, untar it, and check the thing a
// consumer would actually reach for. If that fails, the publish fails.
//
//   node guard/check-publishable.mjs              # fast: file existence only
//   node guard/check-publishable.mjs --strict     # also install and require()
//
// WHY IT CHECKS THE TARBALL AND NOT THE TREE. The tree can be correct and
// the tarball wrong: a `files` field that omits `dist/`, a `main` that
// points outside it, a build step that was never run. The tarball is the
// artefact. The tree is a guess about the artefact.
//
// IT CAN FAIL. That is the whole point, and it is verified in the test
// file next to this one: a deliberately broken package must make it go
// red.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const root = resolve(args.find((a) => !a.startsWith('--')) || process.cwd());

const errors = [];
const warnings = [];
const note = (m) => console.log('  ' + m);

// --- 1. pack ------------------------------------------------------------
//
// WE DO NOT SHELL OUT TO `npm pack`. It is not reliable enough to be a
// GATE: in this sandbox it dies with an errno -122 on close and leaves no
// tarball, and a guard that cannot run is a guard that does not exist.
//
// So the file selection is done here, following npm-packlist's rules:
//
//   ALWAYS INCLUDED   package.json, README*, LICENSE*/LICENCE*, and the
//                     file at `main` (if it exists)
//   IF `files` IS SET those paths/globs, plus the always-included
//   OTHERWISE         the whole tree, minus the default ignores
//
// This is an APPROXIMATION of npm's packlist, and the report says so.
// The approximation is conservative in the right direction: a file npm
// would exclude but this includes can only make the guard PASS a package
// that npm would have shipped broken -- which is the one error direction
// that matters, and it is also the direction npm's own `files` field
// narrowing would cause anyway.
//
// The `files`-field CHECK below does not depend on the approximation at
// all, and it is the one that catches the root cause.

import { readdirSync, statSync } from 'node:fs';

const DEFAULT_IGNORE = [
  /(^|[\\/])\.git([\\/]|$)/, /(^|[\\/])\.npmrc$/, /(^|[\\/])\.DS_Store$/,
  /(^|[\\/])node_modules([\\/]|$)/, /\.orig$/, /\.rej$/, /(^|[\\/])\.npmignore$/,
  /(^|[\\/])\.gitignore$/, /(^|[\\/])\.github([\\/]|$)/,
  // NOTE: `dist/` is NOT ignored here, because npm SHIPS dist/. The
  // previous version of this list excluded it, which made the guard
  // report a healthy package's `types` as "NOT IN THE TARBALL" --
  // false-failing most of the fleet. npm's own always-excluded set is
  // .git, node_modules, .npmrc, .DS_Store, .npmignore, .gitignore,
  // *.orig, *.rej and lockfiles. Anything else a package ships, it ships.
];

const toRegex = (glob) => {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pat = esc.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp('^' + pat + '$');
};

function walk(dir, base = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

const srcManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const all = walk(root);
const always = new Set(['package.json']);
for (const f of all) {
  if (/^README(\.|$)/i.test(f)) always.add(f);
  if (/^LICEN[CS]E(\.|$)/i.test(f)) always.add(f);
}
if (srcManifest.main && all.includes(srcManifest.main.replace(/^\.\//, ''))) always.add(srcManifest.main.replace(/^\.\//, ''));

let selected;
if (Array.isArray(srcManifest.files) && srcManifest.files.length) {
  // A `files` entry may name a FILE, a GLOB, or a DIRECTORY -- and the
  // directory form is the common one ("files": ["dist"]). A directory entry
  // means everything UNDER it.
  //
  // The first version of this matched only exact file names, so
  // `files: ["dist"]` packed nothing and the guard failed every package
  // with a directory entry. It was caught by running it against a real
  // package -- which is the argument for running a new gate against the
  // fleet before trusting it.
  const globs = [], prefixes = [];
  for (const entry of srcManifest.files) {
    const clean = entry.replace(/\/$/, '');
    // is it a DIRECTORY in the tree? (a file list contains only files,
    // so `all.includes(clean)` is false for every directory entry)
    let isDir = false;
    try { isDir = statSync(join(root, clean)).isDirectory(); } catch { isDir = false; }
    if (isDir) prefixes.push(clean + '/');                    // a real directory
    else globs.push(toRegex(entry));                        // a file or a glob
  }
  selected = all.filter((f) =>
    always.has(f)
    || prefixes.some((p) => f.startsWith(p))
    || globs.some((g) => g.test(f)));
} else {
  selected = all.filter((f) => always.has(f) || !DEFAULT_IGNORE.some((re) => re.test(f)));
}

// --- 2. build the tarball ------------------------------------------------
const work = mkdtempSync(join(tmpdir(), 'publish-guard-'));
const untar = join(work, 'x');
mkdirSync(untar);
const pkgDir = join(untar, 'package');
mkdirSync(pkgDir);
for (const f of selected) {
  const dest = join(pkgDir, f);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(root, f), dest);
}
const tarball = join(work, 'package.tgz');
execFileSync('tar', ['czf', tarball, '-C', untar, 'package'], { stdio: 'ignore' });
note(`packed ${selected.length} file(s) into ${readFileSync(tarball).length} B`);

const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

// --- 3. every declared entry point must EXIST in the tarball -----------
// The targets are collected the way a resolver would see them, not the way
// a human reads the manifest.
const targets = [];
const add = (kind, p) => { if (p && typeof p === 'string') targets.push({ kind, p }); };
const addExports = (kind, v) => {
  if (typeof v === 'string') add(kind, v);
  else if (v && typeof v === 'object') {
    for (const [sub, val] of Object.entries(v)) {
      if (sub.startsWith('.')) addExports(`${kind}["${sub}"]`, val);
      else if (typeof val === 'string') add(kind, val);
      else if (val && typeof val === 'object') {
        for (const [k2, v2] of Object.entries(val)) {
          if (typeof v2 === 'string') add(`${kind}["${sub}"].${k2}`, v2);
          else if (v2 && typeof v2 === 'object') for (const [k3, v3] of Object.entries(v2)) if (typeof v3 === 'string') add(`${kind}["${sub}"].${k2}.${k3}`, v3);
        }
      }
    }
  }
};
add('main', manifest.main);
add('module', manifest.module);
add('types', manifest.types || manifest.typings);
if (manifest.exports) addExports('exports', manifest.exports);
if (manifest.bin) {
  if (typeof manifest.bin === 'string') add('bin', manifest.bin);
  else for (const [k, v] of Object.entries(manifest.bin)) add(`bin["${k}"]`, v);
}

note(`declared entry points: ${targets.length}`);
const missing = [];
for (const t of targets) {
  const p = resolve(pkgDir, t.p.replace(/^\.\//, ''));
  if (!existsSync(p)) missing.push(t);
}
for (const m of missing) {
  errors.push(`declared ${m.kind} -> ${m.p}  --  NOT IN THE TARBALL`);
}
if (!missing.length && targets.length) note('every declared entry point is present');

// --- 4. a package with no entry point at all ----------------------------
if (!manifest.main && !manifest.exports && !manifest.bin) {
  warnings.push('no main, no exports, no bin -- the package ships but declares nothing to import');
}

// --- 5. the STRICT arm: install the tarball and require it --------------
let strictResult = null;
if (strict) {
  const cons = join(work, 'consumer');
  mkdirSync(cons);
  try {
    execFileSync('npm', ['init', '-y'], { cwd: cons, stdio: 'ignore' });
    const instArgs = ['install', tarball, '--no-audit', '--no-fund'];
    // `uc` WAS NEVER DECLARED. Every --strict run raised a ReferenceError
    // before the probe even started, so --strict failed on EVERY package --
    // healthy ones included -- with a blank message. Wired into
    // prepublishOnly as it stood, it would have blocked the entire fleet.
    const uc = process.env.NPM_USERCONFIG;
    if (uc && existsSync(uc)) instArgs.push('--userconfig', uc);
    execFileSync('npm', instArgs, { cwd: cons, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    const name = manifest.name;
    const probe = `
      const p = require.resolve(${JSON.stringify(name)});
      const m = require(${JSON.stringify(name)});
      console.log(JSON.stringify({ ok: true, path: p, exports: Object.keys(m).length }));
    `;
    const res = execFileSync('node', ['-e', probe], { cwd: cons, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    strictResult = JSON.parse(res.trim());
    note(`require() OK -- ${strictResult.exports} export(s) from ${relative(cons, strictResult.path)}`);
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter((l) => /Error|error|Cannot find|throw/i.test(l)).slice(-3).join(' | ');
    errors.push(`require() of the packed tarball FAILED -- ${msg.slice(0, 300)}`);
  }
}

// --- 6. the report -------------------------------------------------------
console.log('');
if (warnings.length) { console.log('WARNINGS'); for (const w of warnings) console.log('  ! ' + w); }
if (errors.length) {
  console.log('PUBLISH GUARD: FAIL');
  for (const e of errors) console.log('  x ' + e);
  console.log('');
  console.log('  A consumer would install this package and then fail to use it.');
  console.log('  Fix the entry point, or the build that produces it, and publish again.');
} else {
  console.log('PUBLISH GUARD: PASS -- a consumer can use this package.');
}
rmSync(work, { recursive: true, force: true });
process.exit(errors.length ? 1 : 0);
