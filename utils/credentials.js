/**
 * Copyright 2020 The AMP Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview
 * Provides access to the keys in Cloud Storage that are used for the Ads and
 * Users error reporting projects.
 */

const { Storage } = require('@google-cloud/storage');

const PROJECT_ID = 'amp-error-reporting';
const BUCKET_NAME = `${PROJECT_ID}.appspot.com`;

/**
 * Google Cloud Storage interface for uploading and downloading files.
 */
class CloudStorage {
  /**
   * Constructor.
   * @param {string} projectId Cloud project ID.
   * @param {string} bucketName Cloud Storage bucket name.
   */
  constructor(projectId, bucketName) {
    this.storage = new Storage({ projectId });
    this.bucket = this.storage.bucket(bucketName);
  }

  /**
   * Read a file from storage.
   * @param {string} filename file to download.
   * @return {Promise<string>} file contents.
   */
  async download(filename) {
    const [contents] = await this.bucket.file(filename).download();
    return contents.toString('utf8');
  }
}

const keyStorage = new CloudStorage(PROJECT_ID, BUCKET_NAME);
async function getCredentials(keyFilename) {
  return keyStorage.download(keyFilename).then(JSON.parse);
}

module.exports = { getCredentials };
