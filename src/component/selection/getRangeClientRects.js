/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule getRangeClientRects
 * @typechecks
 * @flow
 */

'use strict';

var UserAgent = require('UserAgent');

var invariant = require('invariant');

var isChrome = UserAgent.isBrowser('Chrome');

// In Chrome, the client rects will include the entire bounds of all nodes that
// begin (have a start tag) within the selection, even if the selection does
// not overlap the entire node. To resolve this, we split the range at each
// start tag and join the client rects together.
// https://code.google.com/p/chromium/issues/detail?id=324437
/* eslint-disable consistent-return */
function getRangeClientRectsChrome(range: Range): Array<ClientRect> {
  var tempRange = range.cloneRange();
  var clientRects = [];

  for (
    var ancestor = range.endContainer;
    ancestor != null;
    ancestor = ancestor.parentNode
  ) {
    // If we've climbed up to the common ancestor, we can now use the
    // original start point and stop climbing the tree.
    var atCommonAncestor = ancestor === range.commonAncestorContainer;
    if (atCommonAncestor) {
      tempRange.setStart(range.startContainer, range.startOffset);
    } else {
      tempRange.setStart(tempRange.endContainer, 0);
    }
    var rects = Array.from(tempRange.getClientRects());
    clientRects.push(rects);
    if (atCommonAncestor) {
      clientRects.reverse();
      return [].concat(...clientRects);
    }
    tempRange.setEndBefore(ancestor);
  }

  invariant(
    false,
    'Found an unexpected detached subtree when getting range client rects.'
  );
}
/* eslint-enable consistent-return */

/**
 * Like range.getClientRects() but normalizes for browser bugs.
 */
var getRangeClientRects = isChrome ?
  getRangeClientRectsChrome :
  function(range: Range): Array<ClientRect> {
    return Array.from(range.getClientRects());
  };

module.exports = getRangeClientRects;
