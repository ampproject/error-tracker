/**
 * @fileoverview Downloads the necessary API secrets to use the
 * amp-error-reporting projects.
 */

const fs = require('fs');
const { keys } = require('./utils/key-storage');

const missingKeys = keys.filter(ks => !fs.existsSync(ks.keyFilename));
if (!missingKeys.length) {
  process.exit(0);
}

const downloads = missingKeys.map(async keyStorage => {
  try {
    await keyStorage.downloadToFile(keyStorage.keyFilename);
    return true;
  } catch (error) {
    console.error(`Error downloading ${keyStorage.keyFilename}`);
    console.error(error);
    fs.unlinkSync(keyStorage.keyFilename);
    return false;
  }
});

Promise.all(downloads).then(statuses => {
  if (!statuses.every(Boolean)) {
    console.error('Cancelling server start');
    process.exit(1);
  }
});
