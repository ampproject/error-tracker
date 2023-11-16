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

import releaseChannels from './release-channels.js';
const RTV_REGEX = /^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d\d)$/;

export default function humanRtv(rtv) {
  try {
    const [
      unusedRtv,
      rtvPrefix,
      unusedYear,
      month,
      day,
      hour,
      minute,
      cherrypicks,
    ] = RTV_REGEX.exec(rtv);
    const channelName =
      rtvPrefix in releaseChannels
        ? releaseChannels[rtvPrefix].name
        : 'Unknown';
    const cpCount = Number(cherrypicks);
    const fingerprint = `${hour}${minute}${cpCount ? `+${cpCount}` : ''}`;

    return `${month}-${day} ${channelName} (${fingerprint})`;
  } catch {
    return rtv;
  }
}
