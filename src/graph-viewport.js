/**
 * graph-viewport.js
 *
 * This module is responsible for creating a component which corresponds to
 * editting a graph on the canvas.
 */

// module dependencies: npm packages
import xs from 'xstream';
import sampleCombine from 'xstream/extra/sampleCombine';
import u from 'unist-builder';
import { h } from '@cycle/dom';
import { withWorldMatrix, scaledFrame } from '@mvarble/frames.js';
import { MouseObject, FilteredMouse, parentSize, refreshReducer, mountCanvas } from '@mvarble/viewport.js';
import * as math from 'mathjs';

// module dependencies: project modules
import { GraphPlane, renderPlane } from './graph-plane';
import { renderGraphNode } from './graph-node';
import { renderGraphEdge } from './graph-edge';

// our export
export {
  GraphViewport,
  renderGraphViewport,
  deleteSelectedNodes,
  appendNode,
};
export default {
  GraphViewport,
  renderGraphViewport,
  deleteSelectedNodes,
  appendNode,
};

/**
 * GraphViewport
 *
 * This component is responsible for editting a graph on the canvas. 
 * The sources are as follows:
 *   - DOM: the DOM driver's return; should be isolated
 *   - props: a stream of an object with field `initState` for the initial 
 *       reducer
 *   - state: the state of the canvas, as returned by @cycle/state
 */
function GraphViewport({ DOM, props, state }) {
  // generate the inital mouse streams from the dom
  const mouse = MouseObject(DOM.select('canvas'));

  // this is the canvas stream
  const canvas$ = DOM.select('canvas').element();

  // initial state reducer
  const initState$ = xs.combine(props, canvas$.take(1))
    .map(([{ initState }, canvas]) => (() => ({
      ...resizeState(
        initState,
        canvas.parentNode.offsetWidth,
        canvas.parentNode.offsetHeight,
      ),
      canvas,
    })));

  // refresh reducer: this checks if the DOM has made our reference stale
  const refreshReducer$ = refreshReducer(state.stream, canvas$);

  // this is a reducer stream that deals with resizing coordinate system on 
  // window resizes
  const resizeState$ = canvas$.compose(parentSize).map(dims$ => dims$.drop(1))
    .flatten()
    .map(dims => (tree => resizeState(tree, ...dims)))
    .compose(mountCanvas(canvas$));

  // simply a subtree of the state
  const planeState$ = state.stream.map(tree => tree.children[0].children[0]);

  // the GraphPlane is the majority of the component; its reducers are simply
  // lifted to include the canvas and window frames
  const planeSink = GraphPlane({ 
    mouse: FilteredMouse({ mouse, node: planeState$ }), 
    state: planeState$,
  });
  const planeReducer$ = planeSink.state
    .map(reducer => (tree => (
      u('GraphViewport', { width: tree.width, height: tree.height },
        [{ 
          ...tree.children[0], 
          children: [reducer(tree.children[0].children[0])],
        }]
      )
    )))
    .compose(mountCanvas(canvas$));

  // return the sink
  return {
    state: xs.merge(initState$, resizeState$, planeReducer$, refreshReducer$),
    viewport: state.stream,
    preventDefault: mouse.wheel,
    DOM: xs.of(h('canvas')),
  };
}

/**
 * Render Functions
 */

function renderGraphViewport(canvas, tree) {
  // extract the frames
  const windowFrame = tree.children[0];
  const plane = windowFrame.children[0];
  const graphNodes = plane.children;

  // prep the context for render
  const context = canvas.getContext('2d');
  context.fillStyle = '#666';

  // clear the viewport and render the gray backdrop
  context.clearRect(0, 0, tree.width, tree.height);
  context.beginPath();
  context.fillRect(0, 0, tree.width, tree.height);

  // render the plane
  renderPlane(context, windowFrame, plane);

  // render the graph edges
  graphNodes.forEach(node => {
    node.children.forEach(e => {
      if (e.type === 'out-edge-node') {
        renderGraphEdge(context, graphNodes, e);
      }
    })
  });

  // render the graph nodes
  [ ...graphNodes ].reverse().forEach(node => {
    renderGraphNode(context, node);
  });
}

/**
 * State Management:
 *
 * The following functions are used in reducers for state management regarding
 * the graph viewport
 */

function resizeState(tree, width, height) {
  // update the window frame
  const windowFrame = withWorldMatrix(tree.children[0], math.matrix([
    [width/2, 0, width/2],
    [0, -height/2, height/2],
    [0, 0, 1]
  ]))

  // return plane scale to normal
  const M = windowFrame.children[0].worldMatrix.valueOf();
  const planeFrame = scaledFrame(
    windowFrame.children[0],
    [-M[1][1] / M[0][0], 1],
    { 
      worldMatrix: math.matrix([
        [1, 0, width/2],
        [0, -1, height/2],
        [0, 0, 1]
      ]),
    }
  );

  // return the tree
  return u(
    'GraphViewport',
    { canvas: tree.canvas, width, height }, 
    [{ ...windowFrame, children: [planeFrame] }]
  );
}

function deleteSelectedNodes(tree) {
  // parse the tree
  const windowFrame = tree.children[0];
  const planeFrame = windowFrame.children[0];

  // filter out the planeFrame children
  planeFrame.children = planeFrame.children.filter(n => n.data.selected);
  return u(
    'GraphViewport', 
    { canvas: tree.canvas, width: tree.width, width: height },
    [{ ...windowFrame, children: [planeFrame] }]
  );
}

function appendNode(tree) {
  // parse the matrices of the frames for dimensions
  const windowFrame = tree.children[0];
  const planeFrame = windowFrame.children[0];
  const wM = windowFrame.worldMatrix.valueOf();
  const pM = planeFrame.worldMatrix.valueOf();

  // create the new box
  const key = planeFrame.children.length 
    ? math.max(planeFrame.children.map(c => c.key)) + 1
    : 0;
  const newBoxData = {
    worldMatrix: math.matrix([
      [2.5 * pM[0][0], 0, wM[0][2]],
      [0, pM[1][1], wM[1][2]],
      [0, 0, 1]
    ]),
    key, 
    data: { 
      clickBox: [-1, -1, 1, 1], 
      selected: true, 
      active: true,
      title: '',
    },
  };
  const inEdgeNodeData = { 
    worldMatrix: math.matrix([
      [0.1 * pM[0][0], 0, wM[0][2]],
      [0, 0.1 * pM[1][1], wM[1][2] + .9 * pM[1][1]],
      [0, 0, 1]
    ]),
    data: { clickBox: [-4, -4, 4, 1], parentKey: key },
  };
  const outEdgeNodeData = {
    worldMatrix: math.matrix([
      [0.1 * pM[0][0], 0, wM[0][2]],
      [0, 0.1 * pM[1][1], wM[1][2] - .9 * pM[1][1]],
      [0, 0, 1]
    ]),
    key: 0,
    data: { clickBox: [-4, -1, 4, 4], parentKey: key },
  };
  const newBox = u('graph-node', newBoxData, [
    u('in-edge-node', inEdgeNodeData),
    u('out-edge-node', outEdgeNodeData),
  ]);

  // return the corresponding tree
  planeFrame.children = [
    newBox,
    ...planeFrame.children.map(deselectBox),
  ];
  return u(
    'GraphViewport', 
    { canvas: tree.canvas, width: tree.width, height: tree.height }, 
    [{ ...windowFrame, children: [planeFrame] }]
  );
};
