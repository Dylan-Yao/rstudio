import { Node as ProsemirrorNode, NodeSpec, NodeType } from 'prosemirror-model';
import { EditorState, Selection, NodeSelection, Transaction } from 'prosemirror-state';
import {
  findParentNode,
  findSelectedNodeOfType,
  ContentNodeWithPos,
  NodeWithPos,
  findParentNodeOfType,
  findChildrenByType,
  findChildren,
} from 'prosemirror-utils';

import {
  PandocTokenReader,
  PandocNodeWriterFn,
  PandocPreprocessorFn,
  PandocBlockReaderFn,
  PandocCodeBlockFilter,
  PandocAstOutputFilter,
  PandocMarkdownOutputFilter,
} from './pandoc';

export interface PandocNode {
  readonly name: string;
  readonly spec: NodeSpec;
  readonly code_view?: CodeViewOptions;
  readonly pandoc: {
    readonly readers?: readonly PandocTokenReader[];
    readonly writer?: PandocNodeWriterFn;
    readonly preprocessor?: PandocPreprocessorFn;
    readonly blockReader?: PandocBlockReaderFn;
    readonly codeBlockFilter?: PandocCodeBlockFilter;
    readonly astOutputFilter?: PandocAstOutputFilter;
    readonly markdownOutputFilter?: PandocMarkdownOutputFilter;
  };
}

export interface CodeViewOptions {
  lang: (node: ProsemirrorNode, content: string) => string | null;
  classes?: string[];
  firstLineMeta?: boolean;
  lineNumbers?: boolean;
}

export type NodeTraversalFn = (
  node: Node,
  pos: number,
  parent: Node,
  index: number,
) => boolean | void | null | undefined;

export function findTopLevelBodyNodes(doc: ProsemirrorNode, predicate: (node: ProsemirrorNode) => boolean) {
  const body = findChildrenByType(doc, doc.type.schema.nodes.body, false)[0];
  const offset = body.pos + 1;
  const nodes = findChildren(body.node, predicate, false);
  return nodes.map(value => ({ ...value, pos: value.pos + offset }));
}

export function findNodeOfTypeInSelection(selection: Selection, type: NodeType): ContentNodeWithPos | undefined {
  return findSelectedNodeOfType(type)(selection) || findParentNode((n: ProsemirrorNode) => n.type === type)(selection);
}

export function firstNode(parent: NodeWithPos, predicate: (node: ProsemirrorNode) => boolean) {
  let foundNode: NodeWithPos | undefined;
  parent.node.descendants((node, pos) => {
    if (!foundNode) {
      if (predicate(node)) {
        foundNode = {
          node,
          pos: parent.pos + 1 + pos,
        };
        return false;
      }
    } else {
      return false;
    }
  });
  return foundNode;
}

export function lastNode(parent: NodeWithPos, predicate: (node: ProsemirrorNode) => boolean) {
  let last: NodeWithPos | undefined;
  parent.node.descendants((node, pos) => {
    if (predicate(node)) {
      last = {
        node,
        pos: parent.pos + 1 + pos,
      };
    }
  });
  return last;
}

export function nodeIsActive(state: EditorState, type: NodeType, attrs = {}) {
  const predicate = (n: ProsemirrorNode) => n.type === type;
  const node = findSelectedNodeOfType(type)(state.selection) || findParentNode(predicate)(state.selection);

  if (!Object.keys(attrs).length || !node) {
    return !!node;
  }

  return node.node.hasMarkup(type, attrs);
}

export function canInsertNode(state: EditorState, nodeType: NodeType) {
  const $from = state.selection.$from;
  for (let d = $from.depth; d >= 0; d--) {
    const index = $from.index(d);
    if ($from.node(d).canReplaceWith(index, index, nodeType)) {
      return true;
    }
  }
  return false;
}

export function insertAndSelectNode(
  node: ProsemirrorNode,
  state: EditorState,
  dispatch: (tr: Transaction<any>) => void,
) {
  // create new transaction
  const tr = state.tr;

  // insert the node over the existing selection
  tr.replaceSelectionWith(node);

  // set selection to inserted node
  const selectionPos = tr.doc.resolve(tr.mapping.map(state.selection.from, -1));
  tr.setSelection(new NodeSelection(selectionPos));

  // dispatch transaction
  dispatch(tr);
}

export function editingRootNode(selection: Selection) {
  const schema = selection.$head.node().type.schema;
  return findParentNodeOfType(schema.nodes.body)(selection) || findParentNodeOfType(schema.nodes.note)(selection);
}