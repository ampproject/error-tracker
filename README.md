# Error reporting

This is not an official Google product

Receives error reports emitted by AMP HTML runtime library and send them to the
[Google Cloud Error Logging service](https://cloud.google.com/error-reporting/).

## Setup and deploy

1. Enable Google Cloud Logging API.
2. Switch app id in app.yaml to your own.
3. Deploy.

```
$ node error-tracker.js
```


This tool does not collect any user data or information. 

Licensed under the Apache 2.0 license 