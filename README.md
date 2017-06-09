# Error reporting

Receives error reports emitted by errors.js and send them to the
[Google Cloud Error Logging service](https://cloud.google.com/error-reporting/).

## Setup and deploy

1. Enable Google Cloud Logging API.
2. Switch app id in app.yaml to your own.
3. Deploy.

```
$ node errortracker.js
```

[Sample URL](https://goo.gl/dKvgfk)

This tool does not collect any user data or information. 

Copyright 2016 The AMP HTML Authors. All Rights Reserved.
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