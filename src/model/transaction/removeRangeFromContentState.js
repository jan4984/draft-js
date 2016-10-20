/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule removeRangeFromContentState
 * @flow
 */

'use strict';

var Immutable = require('immutable');

import type CharacterMetadata from 'CharacterMetadata';
import type ContentState from 'ContentState';
import type {List} from 'immutable';
import SelectionState from 'SelectionState';

function removeRangeFromContentState(
  contentState: ContentState,
  selectionState: SelectionState
): ContentState {
  if (selectionState.isCollapsed()) {
    return contentState;
  }

  var blockMap = contentState.getBlockMap();
  var startKey = selectionState.getStartKey();
  var startOffset = selectionState.getStartOffset();
  var endKey = selectionState.getEndKey();
  var endOffset = selectionState.getEndOffset();

  var startBlock = blockMap.get(startKey);
  var endBlock = blockMap.get(endKey);
  var characterList;
  var removeWholeAtomicBlock = false;

  if (startBlock === endBlock) {
    if(startBlock.getType() === 'atomic' && endOffset > startOffset){
      //atomic only have 1 length text
      removeWholeAtomicBlock = true;
    }
    characterList = removeFromList(
      startBlock.getCharacterList(),
      startOffset,
      endOffset
    );
  } else {
    characterList = startBlock
      .getCharacterList()
      .slice(0, startOffset)
      .concat(endBlock.getCharacterList().slice(endOffset));
  }

  var modifiedStart = removeWholeAtomicBlock
      ?null
      :startBlock.merge({
        text: (
          startBlock.getText().slice(0, startOffset) +
          endBlock.getText().slice(endOffset)
        ),
        characterList,
  });

  var newBlocks = blockMap
    .toSeq()
    .skipUntil((_, k) => k === startKey)
    .takeUntil((_, k) => k === endKey)
    .concat(Immutable.Map([[endKey, null]]))
    .map((_, k) => { return k === startKey ? modifiedStart : null; });
  var selectionAfter = selectionState.merge({
    anchorKey: startKey,
    anchorOffset: startOffset,
    focusKey: startKey,
    focusOffset: startOffset,
    isBackward: false,
  });
  if(removeWholeAtomicBlock){
    var beforeBlock = blockMap
        .reverse()
        .skipUntil((_, k) => k === startKey)
        .skip(1)
        .skipUntil(b=>b.getType() != 'atomic')
        .first();
    if(beforeBlock){
      selectionAfter = SelectionState.createEmpty(beforeBlock.getKey()).merge({
        isBackward:false,
        focusOffset:beforeBlock.getText().length,
        anchorOffset:beforeBlock.getText().length,
      });
    }else{
      selectionAfter = SelectionState.createEmpty(blockMap.first());
    }
  }
  blockMap = blockMap.merge(newBlocks).filter(block => !!block);
  return contentState.merge({
    blockMap,
    selectionBefore:selectionState,
    selectionAfter,
  });
}

/**
 * Maintain persistence for target list when removing characters on the
 * head and tail of the character list.
 */
function removeFromList(
  targetList: List<CharacterMetadata>,
  startOffset: number,
  endOffset: number
): List<CharacterMetadata> {
  if (startOffset === 0) {
    while (startOffset < endOffset) {
      targetList = targetList.shift();
      startOffset++;
    }
  } else if (endOffset === targetList.count()) {
    while (endOffset > startOffset) {
      targetList = targetList.pop();
      endOffset--;
    }
  } else {
    var head = targetList.slice(0, startOffset);
    var tail = targetList.slice(endOffset);
    targetList = head.concat(tail).toList();
  }
  return targetList;
}

module.exports = removeRangeFromContentState;
