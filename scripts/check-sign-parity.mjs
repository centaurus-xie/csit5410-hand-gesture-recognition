import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { motionVector, validateSignModel } from '../web/src/signs.ts';
import { predict } from '../web/src/model.ts';

const folder = process.argv[2];
if (!folder) throw Error('Usage: node --import tsx scripts/check-sign-parity.mjs MODEL_FOLDER');
const read = async name => JSON.parse(await readFile(join(folder, name), 'utf8'));
const model = validateSignModel(await read('classifier.json'));
const { clips, vectors, probabilities } = await read('parity.json');
assert(clips.length > 0);
let featureError = 0;
let probabilityError = 0;
for (const [i, clip] of clips.entries()) {
  const vector = motionVector(clip.frames, clip.sampled_count);
  assert.equal(vector.length, vectors[i].length);
  for (const [j, value] of vector.entries()) {
    featureError = Math.max(featureError, Math.abs(value - vectors[i][j]));
  }
  for (const [j, value] of predict(model, vector).probabilities.entries()) {
    probabilityError = Math.max(probabilityError, Math.abs(value - probabilities[i][j]));
  }
}
assert(featureError < 1e-10 && probabilityError < 1e-9, 'Python and browser results differ');
console.log(`Feature max error: ${featureError}; probability max error: ${probabilityError}`);
