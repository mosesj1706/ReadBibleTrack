/**
 * Makes expo-modules-jsi compile under Swift 6.2 / Xcode 26.
 *
 * expo-modules-jsi@57.0.5 does not build with this toolchain, and the failure
 * is not subtle: seventeen errors before the iOS app can be produced at all.
 * The fixes are small and mechanical, but they live in node_modules, so every
 * `npm install` throws them away. This script puts them back. It is wired to
 * `postinstall`, so an install repairs itself.
 *
 * Two changes, both forced by the compiler rather than chosen:
 *
 *   1. `weak let` is rejected outright — Swift 6.2 requires a weak binding to
 *      be mutable. Changing it to `var` then breaks `Sendable`, because a
 *      Sendable class may not hold mutable state; `nonisolated(unsafe)` is the
 *      documented way to say "I know, and I am handling it", and these files
 *      already use it for their other stored properties.
 *
 *   2. `SWIFT_RETURNS_RETAINED` on a *constructor* is now an error. The
 *      annotation describes the ownership of a returned reference and has no
 *      meaning on an initialiser; earlier compilers ignored it.
 *
 * Idempotent, and silent when there is nothing to do — so when Expo ships a
 * version that compiles on its own, this quietly stops applying and can be
 * deleted along with the postinstall hook.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOTS = ['node_modules/expo-modules-jsi', 'node_modules/expo-modules-core'];

/** Every Swift and header file under a package, however deep. */
async function sourcesUnder(dir) {
  const found = [];
  async function walk(here) {
    let entries;
    try {
      entries = await readdir(here, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(here, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(swift|h)$/.test(entry.name)) found.push(path);
    }
  }
  await walk(dir);
  return found;
}

function repair(source) {
  let out = source;

  // 1. `weak let x` -> `nonisolated(unsafe) weak var x`.
  //
  //    The attribute is matched rather than skipped over, because some of
  //    these already carry it — a local `nonisolated(unsafe) weak let` inside
  //    a function is still a `weak let`, and Swift rejects it just the same.
  //    Capturing it here keeps exactly one copy on the rewritten line.
  out = out.replace(
    /^([ \t]*)(nonisolated\(unsafe\) )?((?:private |internal |public |fileprivate )*)weak let\b/gm,
    (_line, indent, _attr, access) => `${indent}nonisolated(unsafe) ${access}weak var`,
  );

  // 2. The annotation is meaningless on a constructor and now rejected.
  out = out.replace(/SWIFT_RETURNS_RETAINED\s+(RuntimeScheduler\()/g, '$1');

  return out;
}

let changed = 0;
for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const file of await sourcesUnder(root)) {
    const before = readFileSync(file, 'utf8');
    const after = repair(before);
    if (after !== before) {
      writeFileSync(file, after);
      changed += 1;
    }
  }
}

if (changed > 0) {
  console.log(
    `patch-expo-swift: repaired ${changed} file(s) so expo-modules-jsi builds under Swift 6.2.`,
  );
}
