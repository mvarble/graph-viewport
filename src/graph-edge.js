/**
 * graph-edge.js
 *
 * This module is responsible for creating the GraphEdge component and the 
 * associated state management and rendering functions.
 */

// module dependencies: npm packages
import xs from 'xstream';
import sampleCombine from 'xstream/extra/sampleCombine';
import dropRepeats from 'xstream/extra/dropRepeats';
import * as math from 'mathjs';
import { translatedFrame, locFrameTrans } from '@mvarble/frames.js';
import { relativeMousePosition, getOver } from '@mvarble/viewport.js';

// module dependencies: project modules
import { extract } from './utilities';

/**
 * GraphEdge
 *
 * This component is responsible for interpretting mouse clicks for editting 
 * the edges between nodes, be it creating or deleting them.
 */
function GraphEdge({ mouse, state, grandparent }) {
  // append hover data to drag streams
  const hoverDrag$ = mouse.drag.flatten()
    .compose(sampleCombine(state, grandparent))
    .map(([event, state, grandparent]) => {
      const hoveredNode = getOver(event, grandparent);
      if (
        hoveredNode 
        && hoveredNode.type === 'in-edge-node' 
        && hoveredNode.data.parentKey !== state.data.parentKey
      ) {
        return { hoveredNode, event };
      }
      return { position: relativeMousePosition(event), event };
    })
    .compose(dropRepeats((a, b) => (
      a.hoveredNode && b.hoveredNode && a.event.type === b.event.type
    )));

  // use the interpretted drag stream to create the reducers
  const drag$ = hoverDrag$.map(({ event, hoveredNode, position }) => {
    if (event.type === 'mousemove') {
      return {
        self: xs.of(e => updateEdgeNode(e, hoveredNode, position)),
        parent: xs.empty(),
      };
    } else {
      return {
        self: xs.of(e => {
          const eCopy = updateEdgeNode(e, hoveredNode, position);
          eCopy.data.to = undefined;
          return eCopy;
        }),
        parent: xs.of(updateGraphNode),
      };
    }
  });

  // return the sink
  return { 
    self: drag$.compose(extract('self')),
    parent: drag$.compose(extract('parent')),
  };
}
export { GraphEdge };

/**
 * Render Functions
 */

function renderGraphEdge(context, graphNodes, edgeNode) {
  // the style of the render depends on if `linkedTo` or `to` is in the data
  if (typeof edgeNode.data.linkedTo !== 'undefined') {
    renderLinkedGraphEdge(context, graphNodes, edgeNode);
  } else if (typeof edgeNode.data.to !== 'undefined') {
    renderUnlinkedGraphEdge(context, graphNodes, edgeNode);
  }
}

function renderLinkedGraphEdge(context, graphNodes, edgeNode) {
  // get the graph node that this edge is linked to
  const node = graphNodes.find(n => n.key === edgeNode.data.linkedTo);
  if (!node) return;
  
  // setup the context for rendering this edge
  context.lineWidth = 3;
  context.strokeStyle = '#AAA';

  // get the location data
  const canvasFrame = { worldMatrix: math.identity(3) };
  const start = locFrameTrans([0, 0], edgeNode, canvasFrame);
  const end = locFrameTrans([0, 0], node.children[0], canvasFrame);

  // render the edge
  context.beginPath();
  context.moveTo(...start);
  context.lineTo(...end);
  context.stroke();
}

function renderUnlinkedGraphEdge(context, graphNodes, edgeNode) {
  // setup the context for rendering this edge
  context.lineWidth = 3;
  context.strokeStyle = '#DDD';

  // get the location data
  const canvasFrame = { worldMatrix: math.identity(3) };
  const start = locFrameTrans([0, 0], edgeNode, canvasFrame);

  // render the edge
  context.beginPath();
  context.moveTo(...start);
  context.lineTo(...edgeNode.data.to);
  context.stroke();
}

export { renderGraphEdge };

/**
 * State Management:
 *
 * The following functions are used in reducers for state managment regarding
 * graph edges
 */
function updateEdgeNode(edgeNode, hoveredNode, position) {
  return {
    ...edgeNode, 
    data: { 
      ...edgeNode.data, 
      linkedTo: hoveredNode ? hoveredNode.data.parentKey : undefined,
      to: position,
    },
  };
}

function updateGraphNode(node) {
  // this index will determine if we need to add/remove edge nodes
  const index = node.children.findIndex(e => (
    e.type === 'out-edge-node' 
    && typeof e.data.linkedTo === 'undefined'
  ));

  // return the updated node
  if (index < 0) {
    // if there is no unlinked edge node, create a new one
    return addEdgeNode(node) 
  } else if (index === node.children.length - 1) {
    // if the unlined edge node is the last, no changes need be made
    return node;
  } else {
    // if the unlinked edge is not last, remove that edge-node
    return removeEdgeNode(node, index);
  }
}

function addEdgeNode(node) {
  const nodeCopy = { ...node };
  const np1 = nodeCopy.children.length;
  const newEdge = translatedFrame(
    nodeCopy.children[np1-1],
    [2/(np1*(np1+1)), 0],
    node
  );
  newEdge.data.linkedTo = undefined;
  newEdge.key = math.max(node.children.map(e => e.key || 0)) + 1;
  nodeCopy.children = [
    ...node.children.map((e, i) => (
      (e.type === 'out-edge-node')
      ? translatedFrame(e, [-2*i/(np1*(np1+1)), 0], node)
      : e
    )),
    newEdge,
  ];
  return nodeCopy;
}

function removeEdgeNode(node, index) {
  const np1 = node.children.length;
  const before = node.children.slice(0, index).map((e, k) => (
    (e.type === 'out-edge-node')
    ? translatedFrame(e, [2*k/(np1*(np1-1)), 0], node)
    : e
  ));
  const after = node.children
    .slice(index+1, node.children.length)
    .map((e, k) => (
      translatedFrame(e, [-2*(np1-(k+index+1))/(np1*(np1-1)), 0], node)
    ));
  const nodeCopy = { ...node };
  nodeCopy.children = [...before, ...after];
  return nodeCopy;
}
