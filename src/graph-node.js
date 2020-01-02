/**
 * graph-node.js
 *
 * This module is responsible for creating the GraphNode component and the
 * associated state management and rendering functions.
 */

// module dependencies: npm packages
import xs from 'xstream';
import sampleCombine from 'xstream/extra/sampleCombine';
import * as math from 'mathjs';
import {
  translatedFrame,
  locsFrameTrans,
  vecFrameTrans,
} from '@mvarble/frames.js';

// module dependencies: project modules
import {
  keySink,
  mergeSinks,
  extract,
  extractConcurrently,
  liftReducer,
} from './utilities';
import { GraphEdge } from './graph-edge';

/**
 * GraphNode
 *
 * This component is responsible for interpretting mouse clicks for editting
 * nodes, be it moving them or creating edges.
 */
function GraphNode({ mouse, state, parent }) {
  // this stream returns true if and only if the graph node is the only one 
  // that is selected, as interpretted by `state.data.selected`
  const onlySelected$ = xs.combine(parent, state).map(([parent, state]) => {
    const numberSelected = parent.children.filter(c => c.data.selected).length;
    return (state.data.selected && (numberSelected === 1));
  });

  // shift click logic: inclusive selection
  const shiftclick$ = mouse.singleclick
    .compose(sampleCombine(state))
    .filter(([e, _]) => e.shiftKey)
    .map(([_, state]) => (
      state.data.active 
      ? { self: xs.of(deselectNode), parent: xs.empty() } 
      : { self: xs.of(selectNode), parent: xs.of(makeActive(state.key)) }
    ));

  // click logic: exclusive selection
  const click$ = mouse.singleclick
    .compose(sampleCombine(state, onlySelected$))
    .filter(([e, _]) => !e.shiftKey)
    .map(([_, state, onlySelected]) => (
      state.data.active 
      ? (
        onlySelected
        ? { self: xs.of(deselectNode), parent: xs.empty() }
        : { self: xs.empty(), parent: xs.of(makeOnlySelected(state.key)) }
      )
      : { self: xs.empty(), parent: xs.of(makeOnlySelected(state.key)) }
    ));

  // drag logic: move selected graph nodes
  const drag$ = mouse.select().drag
    .compose(sampleCombine(state))
    .map(([move$, state]) => {
      const moveStart$ = move$.take(1).map(e => (
        state.data.active
        ? xs.of(dragNodes(e))
        : ((state.data.selected || e.shiftKey)
          ? xs.merge(xs.of(makeActive(state.key)), xs.of(dragNodes(e)))
          : xs.merge(xs.of(makeOnlySelected(state.key)), xs.of(dragNodes(e)))
        )
      )).flatten();
      const moveEnd$ = move$.drop(1).filter(e => e.movementX && e.movementY)
        .map(dragNodes);
      return {
        self: xs.empty(),
        parent: xs.merge(moveStart$, moveEnd$),
      };
    });

  // create streams for each GraphEdge of this GraphNode
  const children$ = state.map(state => {
    const childrenSinks = state.children
      .filter(n => n.type === 'out-edge-node')
      .map(edge => {
        const edgeSink = GraphEdge({ 
          mouse: mouse.select(edge.key), 
          state: xs.of(edge),
          grandparent: parent,
        });
        return keySink(edgeSink, edge.key, ['self']);
      });
    return mergeSinks(childrenSinks, ['self', 'parent']);
  })

  // return the sink
  return { 
    self: xs.merge(
      shiftclick$.compose(extract('self')),
      click$.compose(extract('self')),
      drag$.compose(extract('self')),
      children$.compose(liftReducer('self')),
      children$.compose(extractConcurrently('parent')),
    ),
    parent: xs.merge(
      shiftclick$.compose(extract('parent')),
      click$.compose(extract('parent')),
      drag$.compose(extract('parent')),
    ),
  };
}
export { GraphNode };

/**
 * Render functions
 */

function renderGraphNode(context, node) {
  // setup the context for rendering this node
  context.lineWidth = 1;
  context.strokeStyle = node.data.active 
    ? 'yellow'
    : (node.data.selected ? '#cc7f19' : 'black');
  context.fillStyle = 'rgba(255, 255, 255, 0.8)';

  // get the coordinates of this node in canvas frame
  const nodeCoords = locsFrameTrans(
    [[-1, 1], [1, -1]],
    node,
    { worldMatrix: math.identity(3) }
  );
  const disp = math.subtract(nodeCoords[1], nodeCoords[0]);

  // draw the rectangle
  context.beginPath();
  context.rect(...nodeCoords[0], ...disp);
  context.fill();
  context.stroke();

  // draw each of the input/outputs of the graph nodes
  [ ...node.children ].reverse().forEach(e => renderEdgeNode(context, e));

  // return if there is no title to render
  if (!node.data.title || node.data.title === '') return;

  // calculate the size of the coordinates of the text
  const fontSize = vecFrameTrans(
    [0.2, 0], 
    node, 
    { worldMatrix: math.identity(3) }
  )[0];
  const start = math.multiply(0.5, math.add(...nodeCoords, [0, 0.5*fontSize]));

  // setup the context for rendering
  context.font = `${fontSize}px Arial`;
  context.fillStyle = 'black';
  context.textAlign = 'center';

  // render text
  context.fillText(node.data.title, ...start);
}

function renderEdgeNode(context, e) {
  // get the coordinates of the little edge block
  const eMatrix = e.worldMatrix.valueOf();
  const disp = eMatrix[0][0];
  const pos = [eMatrix[0][2]-disp, eMatrix[1][2]-disp];

  // setup the context for the render
  context.fillStyle = 
    (e.type === 'in-edge-node') 
    ? 'rgba(255, 200, 0, 1)'
    : 'rgba(0, 255, 200, 1)';

  // render
  context.beginPath();
  context.rect(...pos, 2 * disp, 2 * disp);
  context.fill();
  context.stroke();
}

export { renderGraphNode };

/**
 * State Management:
 *
 * The following functions are used in reducers for state management regarding
 * graph nodes.
 */

function selectNode(node) {
  const nodeCopy = { ...node };
  nodeCopy.data.selected = true;
  nodeCopy.data.active = true;
  return nodeCopy;
}

function deselectNode(node) {
  const nodeCopy = { ...node };
  nodeCopy.data.selected = false;
  nodeCopy.data.active = false;
  return nodeCopy;
}
export { deselectNode };

function moveTop(key) {
  return parent => {
    const index = parent.children.findIndex(c => c.key === key);
    if (index >= 0) {
      const parentCopy = { ...parent };
      parentCopy.children = [
        parent.children[index],
        ...parent.children.slice(0, index),
        ...parent.children.slice(index+1, parent.children.length),
      ];
      return parentCopy;
    }
    return parent;
  }
}

function makeActive(key) {
  return parent => {
    const parentCopy = moveTop(key)(parent);
    const L = parentCopy.children.length;
    if (L && parentCopy.children[0].key === key) {
      parentCopy.children = [
        selectNode(parentCopy.children[0]),
        ...parentCopy.children.slice(1, L).map(c => ({
          ...c, 
          data: { ...c.data, active: false }
        })),
      ];
    }
    return parentCopy;
  }
}

function makeOnlySelected(key) {
  return parent => {
    const parentCopy = moveTop(key)(parent);
    const L = parentCopy.children.length;
    if (L && parentCopy.children[0].key === key) {
      parentCopy.children = [
        selectNode(parentCopy.children[0]),
        ...parentCopy.children.slice(1, L).map(deselectNode),
      ];
    }
    return parentCopy;
  }
}

function movedNode(node, dx, dy) {
  return translatedFrame(node, [dx, dy], { worldMatrix: math.identity(3) });
}

function dragNodes({ movementX, movementY }) {
  return parent => {
    const parentCopy = { ...parent };
    parentCopy.children = parentCopy.children.map(node => (
      node.data.selected
      ? movedNode(node, movementX, movementY)
      : node
    ));
    return parentCopy;
  }
}
