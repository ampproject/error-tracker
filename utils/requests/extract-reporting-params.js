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
 * Parses options from the error reporting URL params into an object with clear
 * keys and sanitized values.
 */
import { stringify } from './query-string.js';
import safeDecodeURIComponent from 'safe-decode-uri-component';

export function extractReportingParams(params) {
  const boolProp = (key) => params[key] === '1';
  const strProp = (key) => params[key]?.trim() ?? '';

  return {
    assert: boolProp('a'),
    binaryType: strProp('bt'),
    canary: boolProp('ca'),
    cdn: strProp('cdn'),
    debug: boolProp('debug'),
    expected: boolProp('ex'),
    message: safeDecodeURIComponent(strProp('m')),
    buildQueryString: () => stringify(params),
    prethrottled: boolProp('pt'),
    runtime: params.rt,
    singlePassType: params.spt,
    stacktrace: safeDecodeURIComponent(strProp('s')),
    thirdParty: boolProp('3p'),
    version: params.v,
  };
}
