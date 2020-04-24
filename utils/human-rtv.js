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

const RTV_REGEX = /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d\d)$/;
const RELEASE_CHANNELS = {
  '00': 'Experimental',
  '01': 'Stable',
  '02': 'Control',
  '03': 'Beta',
  '04': 'Nightly',
  '05': 'Nightly-Control',
  '10': 'Experiment-A',
  '11': 'Experiment-B',
  '12': 'Experiment-C',
  '20': 'Ads-Experiment-A-Control',
  '21': 'Ads-Experiment-A',
  '22': 'Ads-Experiment-B-Control',
  '23': 'Ads-Experiment-B',
  '24': 'Ads-Experiment-C-Control',
  '25': 'Ads-Experiment-C',
};

module.exports = function humanRtv(rtv) {
  try {
    const [
      unusedRtv,
      channel,
      unusedYear,
      month,
      day,
      hour,
      minute,
      cherrypicks,
    ] = rtv.match(RTV_REGEX);
    const date = `${month}-${day}`;
    const channelName = RELEASE_CHANNELS[channel] || 'Unknown';
    // This component is taken directly out of the RTV to allow sanity-checking
    // the match to an RTV.

    let cpCount = parseInt(cherrypicks, 10);
    // Temporary band-aid until the cherry-pick part of the RTV has been fully
    // adopted; ignores RTVs that look like they have an unreasonable number of
    // cherry-picks.
    // TODO(rcebulko): Remove once cherry-pick segment of RTV is in place.
    if (cpCount > 10) {
      cpCount = 0;
    }
    const fingerprint = `${hour}${minute}${cpCount ? `+${cpCount}` : ''}`;

    return `${month}-${day} ${channelName} (${fingerprint})`;
  } catch (e) {
    return rtv;
  }
};
