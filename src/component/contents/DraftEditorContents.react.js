/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule DraftEditorContents.react
 * @typechecks
 * @flow
 */

'use strict';

const DraftEditorBlock = require('DraftEditorBlock.react');
const DraftOffsetKey = require('DraftOffsetKey');
const EditorState = require('EditorState');
const React = require('React');

const cx = require('cx');
const joinClasses = require('joinClasses');
const nullthrows = require('nullthrows');

import type {BidiDirection} from 'UnicodeBidiDirection';
import type ContentBlock from 'ContentBlock';

type Props = {
  blockRendererFn: Function,
  blockStyleFn: (block: ContentBlock) => string,
  editorState: EditorState,
};

/**
 * `DraftEditorContents` is the container component for all block components
 * rendered for a `DraftEditor`. It is optimized to aggressively avoid
 * re-rendering blocks whenever possible.
 *
 * This component is separate from `DraftEditor` because certain props
 * (for instance, ARIA props) must be allowed to update without affecting
 * the contents of the editor.
 */
class DraftEditorContents extends React.Component {
  shouldComponentUpdate(nextProps: Props): boolean {
    const prevEditorState = this.props.editorState;
    const nextEditorState = nextProps.editorState;

    const prevDirectionMap = prevEditorState.getDirectionMap();
    const nextDirectionMap = nextEditorState.getDirectionMap();

    // Text direction has changed for one or more blocks. We must re-render.
    if (prevDirectionMap !== nextDirectionMap) {
      return true;
    }

    const didHaveFocus = prevEditorState.getSelection().getHasFocus();
    const nowHasFocus = nextEditorState.getSelection().getHasFocus();

    if (didHaveFocus !== nowHasFocus) {
      return true;
    }

    const nextNativeContent = nextEditorState.getNativelyRenderedContent();

    const wasComposing = prevEditorState.isInCompositionMode();
    const nowComposing = nextEditorState.isInCompositionMode();

    // If the state is unchanged or we're currently rendering a natively
    // rendered state, there's nothing new to be done.
    if (
      prevEditorState === nextEditorState ||
      (
        nextNativeContent !== null &&
        nextEditorState.getCurrentContent() === nextNativeContent
      ) ||
      (wasComposing && nowComposing)
    ) {
      return false;
    }

    const prevContent = prevEditorState.getCurrentContent();
    const nextContent = nextEditorState.getCurrentContent();
    const prevDecorator = prevEditorState.getDecorator();
    const nextDecorator = nextEditorState.getDecorator();
    return (
      wasComposing !== nowComposing ||
      prevContent !== nextContent ||
      prevDecorator !== nextDecorator ||
      nextEditorState.mustForceSelection()
    );
  }

  render(): React.Element<any> {
    const {
      blockRenderMap,
      blockRendererFn,
      customStyleMap,
      customStyleFn,
      editorState,
    } = this.props;

    const content = editorState.getCurrentContent();
    const selection = editorState.getSelection();
    const forceSelection = editorState.mustForceSelection();
    const decorator = editorState.getDecorator();
    const directionMap = nullthrows(editorState.getDirectionMap());

    const blocksAsArray = content.getBlocksAsArray();
    const processedBlocks = [];
    let currentDepth = null;

    let currentWrappedBlocks;
    let block, key, blockType, child, childProps, wrapperTemplate;
    let offsetKeys=[];

    let lastWrapperTemplate = null;


    for (let ii = 0; ii < blocksAsArray.length; ii++) {
      const block = blocksAsArray[ii];
      const key = block.getKey();
      const blockType = block.getType();

      const customRenderer = blockRendererFn(block);
      let CustomComponent, customProps, customEditable;
      if (customRenderer) {
        CustomComponent = customRenderer.component;
        customProps = customRenderer.props;
        customEditable = customRenderer.editable;
      }

      //const direction = directionMap.get(key);
      //text align is controlled in block meat data (part of editorstate) now
      const direction = "NEUTRAL";
      const offsetKey = DraftOffsetKey.encode(key, 0, 0);
      const componentProps = {
        contentState: content,
        block,
        blockProps: customProps,
        customStyleMap,
        customStyleFn,
        decorator,
        direction,
        forceSelection,
        key,
        offsetKey,
        selection,
        tree: editorState.getBlockTree(key),
      };

      const configForType = blockRenderMap.get(blockType);
      const wrapperTemplate = configForType.wrapper;

      const depth = block.getDepth();
      let className = this.props.blockStyleFn(block);

      // List items are special snowflakes, since we handle nesting and
      // counters manually.
      /* it's dynamic now, using block level meta data
      if (Element === 'li') {
        const shouldResetCount = (
          lastWrapperTemplate !== wrapperTemplate ||
          currentDepth === null ||
          depth > currentDepth
        );
        className = joinClasses(
          className,
          getListItemClasses(blockType, depth, shouldResetCount, direction)
        );
      }*/
      const blockData = block.getData();
      const Element = (blockData && blockData.get('overrideStyle') && blockData.get('overrideStyle').has('listStyle'))
          ? 'li'
          : (configForType.element || blockRenderMap.get('unstyled').element);

      const Component = CustomComponent || DraftEditorBlock;
      let childProps = {
        style:{},
        className,
        'data-block': true,
        'data-editor': this.props.editorKey,
        'data-offset-key': offsetKey,
        key,
      };

      if(blockData){
        if(blockData.get('style')){
          if(blockData.get('overrideStyle')){
            childProps.style = blockData.get('style').merge(blockData.get('overrideStyle')).toObject();
          }else {
            childProps.style = blockData.get('style').toObject();
          }
        }else{
          if(blockData.get('overrideStyle')){
            childProps.style = blockData.get('overrideStyle').toObject();
          }
        }
      }
      if (customEditable !== undefined) {
        childProps = {
          ...childProps,
          contentEditable: customEditable,
          suppressContentEditableWarning: true,
        };
      }

      const child = React.createElement(
        Element,
        childProps,
        <Component {...componentProps} />,
      );

      processedBlocks.push({
        block: child,
        wrapperTemplate,
        key,
        offsetKey,
      });

      if (wrapperTemplate) {
        currentDepth = block.getDepth();
      } else {
        currentDepth = null;
      }
      lastWrapperTemplate = wrapperTemplate;
    }

    /*
     * jan4984:WE NOT USE STATIC WRAPPER element, but dynamic wrapper function blockWrapperFn.
     * also, we not want `contiguous runs of blocks that have the same wrapperTemplate`, because user
     * may add a group of block after another with same wrapperTemplate
     */

    // Group contiguous runs of blocks that have the same wrapperTemplate
    const outputBlocks = [];
    for (let ii = 0; ii < processedBlocks.length; ) {
      const info = processedBlocks[ii];
      if (info.wrapperTemplate) {
        const blocks = [];
        do {
          blocks.push(processedBlocks[ii].block);
          ii++;
        } while (
          ii < processedBlocks.length &&
          processedBlocks[ii].wrapperTemplate === info.wrapperTemplate
        );
        const wrapperElement = React.cloneElement(
          info.wrapperTemplate,
          {
            key: info.key + '-wrap',
            'data-offset-key': info.offsetKey,
          },
          blocks
        );
        outputBlocks.push(wrapperElement);
      } else {
        outputBlocks.push(info.block);
        ii++;
      }

      offsetKeys.push(info.offsetKey);
    }


    if(this.props.blockWrapperFn){
      return <div data-contents="true">{this.props.blockWrapperFn(blocksAsArray, offsetKeys, outputBlocks)}</div>;
    }

    return <div data-contents="true">{outputBlocks}</div>;
  }
}

/**
 * Provide default styling for list items. This way, lists will be styled with
 * proper counters and indentation even if the caller does not specify
 * their own styling at all. If more than five levels of nesting are needed,
 * the necessary CSS classes can be provided via `blockStyleFn` configuration.
 */
function getListItemClasses(
  type: string,
  depth: number,
  shouldResetCount: boolean,
  direction: BidiDirection
): string {
  return cx({
    'public/DraftStyleDefault/unorderedListItem':
      type === 'unordered-list-item',
    'public/DraftStyleDefault/orderedListItem':
      type === 'ordered-list-item',
    'public/DraftStyleDefault/reset': shouldResetCount,
    'public/DraftStyleDefault/depth0': depth === 0,
    'public/DraftStyleDefault/depth1': depth === 1,
    'public/DraftStyleDefault/depth2': depth === 2,
    'public/DraftStyleDefault/depth3': depth === 3,
    'public/DraftStyleDefault/depth4': depth === 4,
    'public/DraftStyleDefault/listLTR': direction === 'LTR',
    'public/DraftStyleDefault/listRTL': direction === 'RTL',
  });
}

module.exports = DraftEditorContents;
