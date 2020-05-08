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
 * Provides information about release channel prefixes.
 */

module.exports = {
  '00': { group: '1%', name: 'Experimental' },
  '01': { group: 'Production', name: 'Stable' },
  '02': { group: 'Production', name: 'Control' },
  '03': { group: '1%', name: 'Beta' },
  '04': { group: 'Nightly', name: 'Nightly' },
  '05': { group: 'Nightly', name: 'Nightly-Control' },
  '10': { group: 'Experiments', name: 'Experiment-A' },
  '11': { group: 'Experiments', name: 'Experiment-B' },
  '12': { group: 'Experiments', name: 'Experiment-C' },
  // Ads error reporting will get all of the below channels, so the service
  // bucket names can be more verbose.
  '20': { group: 'Inabox-Control-A', name: 'Inabox-Control-A' },
  '21': { group: 'Inabox-Experiment-A', name: 'Inabox-Experiment-A' },
  '22': { group: 'Inabox-Control-B', name: 'Inabox-Control-B' },
  '23': { group: 'Inabox-Experiment-B', name: 'Inabox-Experiment-B' },
  '24': { group: 'Inabox-Control-C', name: 'Inabox-Control-C' },
  '25': { group: 'Inabox-Experiment-C', name: 'Inabox-Experiment-C' },
};
