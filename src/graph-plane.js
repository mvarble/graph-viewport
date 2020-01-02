/**
 * graph-plane.js
 *
 * This module is responsible for creating the GraphPlane component and the 
 * associated state management and rendering functions.
 */

// module dependencies: npm packages
import xs from 'xstream';
import sampleCombine from 'xstream/extra/sampleCombine';
import {
  translatedFrame,
  locFrameTrans,
  locsFrameTrans,
  vecFrameTrans,
  vecsFrameTrans,
  scaledFrame,
} from '@mvarble/frames.js';
import {
  FilteredMouse,
  KilledMouse,
  relativeMousePosition,
} from '@mvarble/viewport.js';
import * as math from 'mathjs';

// module dependencies: project modules
import {
  keySink,
  mergeSinks,
  extractConcurrently,
  liftReducer
} from './utilities';
import { GraphNode, deselectNode } from './graph-node';

/**
 * GraphPlane
 *
 * This component is responsible for holding the GraphNodes and GraphEdges.
 */
function GraphPlane({ mouse, state }) {
  // this is a reducer stream that deals with updating the plane zoom
  const changeZoom$ = mouse.wheel.map(e => (state => changeZoom(e, state)));

  // drags on the plane will translate the plane
  const drag$ = mouse.select().drag.flatten()
    .filter(e => e.movementX && e.movementY)
    .map(e => (state => dragPlane(state, e.movementX, e.movementY)));

  // single clicks on the plane desect the graph nodes
  const deselect$ = mouse.select().singleclick.mapTo(deselectGraphNodes);

  // parse the children and pass them streams for state management
  const children$ = state.map(plane => {
    const childrenSinks = plane.children.map(child => {
      const graphNodeSink = GraphNode({
        mouse: FilteredMouse({
          mouse: KilledMouse({ 
            mouse: mouse.select(child.key), 
            end: state.drop(1) 
          }),
          node: xs.of(child),
        }),
        state: xs.of(child),
        parent: xs.of(plane),
      });
      return keySink(graphNodeSink, child.key, ['self']);
    });
    return mergeSinks(childrenSinks, ['self', 'parent']);
  });

  return {
    state: xs.merge(
      changeZoom$, 
      drag$, 
      deselect$,
      children$.compose(liftReducer('self')),
      children$.compose(extractConcurrently('parent')),
    ),
  };
}
export { GraphPlane };

/**
 * Render functions
 */

function renderPlane(context, windowFrame, plane) {
  // prepare the context for render
  context.strokeStyle = '#555';
  context.lineWidth = 1;

  // get the minimal and maximal plane coordinates the window can see
  const [bL, tR] = locsFrameTrans(
    [[-1, -1], [1, 1]],
    windowFrame,
    plane
  );
  const [mX, mY] = math.floor(bL);
  const [MX, MY] = math.ceil(tR);
  const xCount = 2 * (MX - mX + 1);
  const yCount = 2 * (MY - mY + 1);

  // get bottom-left coordinate in canvas coordinates
  const canvasFrame = { worldMatrix: math.identity(3) };
  const start = locFrameTrans([mX, mY], plane, canvasFrame);

  // get the basis vectors of the plane/windowFrame in canvasFrame 
  // coordinates
  let [dx, dy] = vecsFrameTrans([[0.5, 0], [0, 0.5]], plane, canvasFrame);
  let [lX, lY] = vecsFrameTrans([[3, 0], [0, 3]], windowFrame, canvasFrame);

  // render the horizontal/vertical lines on plane
  context.beginPath();
  [ ...Array(xCount).keys() ].forEach((_, i) => {
    const base = math.add(start, math.multiply(i, dx));
    context.moveTo(...base);
    context.lineTo(...math.add(base, lY));
  });
  [ ...Array(yCount).keys() ].forEach((_, i) => {
    const base = math.add(start, math.multiply(i, dy));
    context.moveTo(...base);
    context.lineTo(...math.add(base, lX));
  });
  context.stroke();
}
export { renderPlane };

/**
 * State Management:
 *
 * The following functions are used in reducers for state management regarding
 * graph nodes.
 */

function deselectGraphNodes(plane) {
  const planeCopy = { ...plane };
  planeCopy.children = plane.children.map(deselectNode);
  return planeCopy;
}

function changeZoom(event, plane) {
  // parse the event
  const { deltaY } = event;

  // check if the zoom is within permissible scale: diagonal in [5px, 10px]
  const zoomScale = math.sqrt(math.norm(vecFrameTrans(
    [1, 1],
    plane,
    { worldMatrix: math.identity(3) }
  )));
  if (zoomScale < 5 && deltaY > 0) return plane;
  if (zoomScale > 10 && deltaY < 0) return plane;

  // create a frame based at the mouse location
  const mousePos = relativeMousePosition(event);
  const mouseFrame = { 
    worldMatrix: math.matrix([
      [1, 0, mousePos[0]],
      [0, -1, mousePos[1]],
      [0, 0, 1]
    ]),
  };

  // return the new state
  return scaledFrame(
    plane,
    math.multiply(math.pow(1.1, -deltaY), [1, 1]),
    mouseFrame
  );
}

function dragPlane(plane, dx, dy) {
  // update plane frame
  const planeFrame = translatedFrame(
    plane,
    [dx, dy],
    { worldMatrix: math.identity(3) }
  );
  planeFrame.children = planeFrame.children.map(deselectNode);
  return planeFrame;
}
