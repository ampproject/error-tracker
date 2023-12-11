# Error reporting

This is not an official Google product

Receives error reports emitted by AMP HTML runtime library and sends them to the
[Google Cloud Error Logging service](https://cloud.google.com/error-reporting/).

This tool does not collect any user data or information.

## Setup

1. Enable Google Cloud Logging API.
2. Authenticate with Google Cloud: `$ gcloud auth login`
3. Start the server: `$ npm start`

## Deployments

This application runs on [Google Cloud Functions](https://cloud.google.com/functions). There are three endpoints that execute the same functionality:

- `/r` - 90% of traffic goes to this endpoint
- `/r-beta` - 10% of traffic goes to this endpoint
- `/r-dev` - only manual traffic goes to this endpoint

Note that [amphtml](https://github.com/ampproject/amphtml), by default, sends reports to https://us-central1-amp-error-reporting.cloudfunctions.net/r and to https://us-central1-amp-error-reporting.cloudfunctions.net/r-beta. This is considered the canonical error reporting service.

### Deploying to `/r-dev`

Any developer with a Google Cloud Project that was set up as above can deploy to the `/r-dev` endpoint of their project by running `npm run deploy-dev`. This action will directly deploy the function to GCP.

### Deploying to `/r-beta`

Commits merged to this repository's `main` branch are automatically deployed to the `/r-beta` endpoint on the canonical error reporting service using a [Cloud Build](https://cloud.google.com/build) action, defined in the [cloudbuild.yaml](./cloudbuild.yaml) config file.

### Deploying to `/r`

This action can only be performed by GitHub users with write permission on this repository. To deploy to the production/stable endpoint `/r`, run `npm run deploy-stable`. This will create and push a Git tag of the form `deploy-stable-YYMMDDHHMMSS`, which in turn triggers a Cloud Build action similar to the beta environment.

## License

    Licensed under the Apache 2.0 license
    http://www.apache.org/licenses/LICENSE-2.0
