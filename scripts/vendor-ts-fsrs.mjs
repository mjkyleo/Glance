// Vendor ts-fsrs 6 (FSRS-6 model only) as a browser global for the contrast side-path.
// Output: app/js/vendor/ts-fsrs.js  → window.TSFSRS
// This is a DEV/verification aid; the in-use scheduler (app/js/srs.js) is NOT replaced.
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Re-export only the FSRS-6 algorithm pieces + Rating enum. Importing Rating from
// srs-kit (not the ts-fsrs main index) avoids bundling the default FSRS-7 scheduler.
const entry = `
export {
  FSRS6Algorithm, FSRS6Model, FSRS6_DEFAULT_WEIGHTS, FSRS6_MODEL_BOUNDS,
  FSRS6_DECAY, FSRS6_W17_W18_CEILING, forgettingCurve, computeDecayFactor,
  clipFSRS6Parameters, checkFSRS6Parameters
} from 'ts-fsrs/models/fsrs-6';
export { Rating } from '@open-spaced-repetition/srs-kit';
`;

await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'ts-fsrs-entry.mjs', loader: 'js' },
  bundle: true,
  format: 'iife',
  globalName: 'TSFSRS',
  platform: 'browser',
  target: ['es2018'],
  outfile: path.join(root, 'app/js/vendor/ts-fsrs.js'),
  minify: false,
  legalComments: 'inline',
  logLevel: 'info'
});
console.log('vendored → app/js/vendor/ts-fsrs.js (global TSFSRS)');