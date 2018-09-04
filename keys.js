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

const {Storage} = require('@google-cloud/storage');
const gcs = Storage({
  projectId: 'amp-error-reporting',
});
const bucket = gcs.bucket('amp-error-reporting.appspot.com');

const downloads = keys.map(key => {
  if (fs.existsSync(key)) {
    return;
  }

  return bucket.file(key)
    .download({ destination: key })
    .then(() => {
      return true;
    }, error => {
      console.error(`Error downloading ${key}`);
      console.error(error);
      fs.unlinkSync(key);
      return false;
    });
});

Promise.all(downloads).then(statuses => {
  if (!statuses.every(Boolean)) {
    console.error('Cancelling server start');
    process.exit(1);
  }
});
