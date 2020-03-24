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

/**
 * Copyright 2019 The AMP HTML Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { Storage } = require('@google-cloud/storage');

const PROJECT_ID = 'amp-error-reporting';
const BUCKET_NAME = `${PROJECT_ID}.appspot.com`;
const KEYS = {
  ads: 'amp-error-reporting-ads.json',
  users: 'amp-error-reporting-users.json',
};

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
    const [contents] = await this.storage.file(filename).download();
    return contents.toString('utf8');
  }

  /**
   * Download a file from storage.
   * @param {string} filename file to download.
   * @param {string} destination location to download to.
   * @return {Promise}
   */
  async downloadToFile(filename, destination) {
    await this.storage.file(filename).download({ destination });
  }
}

/**
 * Interface for accessing error reporting project key files.
 */
class KeyStorage extends CloudStorage {
  /**
   * Constructor.
   * @param {string} projectId Cloud project ID.
   * @param {string} bucketName Cloud Storage bucket name.
   * @param {string} keyFilename key JSON file name.
   */
  constructor(projectId, bucketName, keyFilename) {
    super(projectId, bucketName);
    this.keyFilename = keyFilename;
  }

  /**
   * Read the key file from storage.
   * @return {Promise<string>} file contents.
   */
  async download() {
    return super.download(this.keyFilename);
  }

  /**
   * Download and attempt to parse the credentials in the key file.
   * @return {Promise<!Object>}
   */
  async credentials() {
    return this.download().then(JSON.parse);
  }

  /**
   * Download a file from storage.
   * @param {string} filename file to download.
   * @param {string} destination location to download to.
   * @return {Promise}
   */
  async downloadToFile(destination) {
    await super.downloadToFile(this.keyFilename, destination);
  }
}

const keys = {};
Object.entries(KEYS).forEach(([name, keyStorage]) => {
  keys[name] = new KeyStorage(PROJECT_ID, BUCKET_NAME, keyStorage.keyFilename);
});

module.exports = { keys, KeyStorage };
