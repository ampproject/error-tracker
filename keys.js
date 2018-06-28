/**
 * @fileoverview Downloads the necessary API secrets to use the
 * amp-error-reporting projects.
 */

const fs = require('fs');

const keys = [
  'amp-error-reporting-ads.json',
  'amp-error-reporting-users.json',
];
if (keys.every(k => fs.existsSync(k))) {
  process.exit(0);
}

const storage = require('@google-cloud/storage');
const gcs = storage({
  projectId: 'amp-error-reporting',
});
const bucket = gcs.bucket('amp-error-reporting.appspot.com');

keys.forEach(key => {
  if (fs.existsSync(key)) {
    return;
  }

  bucket.file(key)
    .download({ destination: key })
    .catch(error => {
      console.error(`Error downloading ${key}`);
      console.error(error);
      process.exit(1);
    });
});
