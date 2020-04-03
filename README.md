# Error reporting

[![Greenkeeper badge](https://badges.greenkeeper.io/ampproject/error-tracker.svg)](https://greenkeeper.io/)

This is not an official Google product

Receives error reports emitted by AMP HTML runtime library and sends them to the
[Google Cloud Error Logging service](https://cloud.google.com/error-reporting/).

## Setup

1. Enable Google Cloud Logging API.
2. Authenticate with Google Cloud: `$ gcloud auth login`
3. Start the server: `$ npm start`

## Deployment

To deploy to the development endpoint `r-dev`, run `npm run deploy-dev`.
To deploy to the staging/beta endpoint `r-beta`, commit to master (by merging a PR) to automatically trigger a cloud build. Alternately, push a tag of the form `deploy-beta-YYMMDDHHMMSS`.
To deploy to the production/stable endpoint `r`, push a tag of the form `deploy-stable-YYMMDDHHMMSS`.

This tool does not collect any user data or information.

    Licensed under the Apache 2.0 license
    http://www.apache.org/licenses/LICENSE-2.0
