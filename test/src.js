import * as math from 'mathjs';
import u from 'unist-builder';
import xs from 'xstream';
import sampleCombine from 'xstream/extra/sampleCombine';
import { run } from '@cycle/run';
import { withState } from '@cycle/state';
import { h, makeDOMDriver } from '@cycle/dom';
import { GraphViewport, renderGraphViewport } from '../index';
import { makeViewportDriver, parentSize } from '@mvarble/viewport.js';
import { translatedFrame } from '@mvarble/frames.js';

// viewport driver
const viewport = makeViewportDriver(renderGraphViewport);

// prevent default driver
const preventDefault = w$ => {
  w$.addListener({ next: e => e.preventDefault ? e.preventDefault() : null });
};

// initial state
const M1 = math.matrix([[0.1, 0, 0], [0, 0.1, 0], [0, 0, 1]]);
const clickBox = [-1, -1, 1, 1];
const createNode = key => {
  const wM = math.identity(3).valueOf();
  const pM = M1.valueOf();
  const newNodeData = {
    worldMatrix: math.matrix([
      [2.5 * pM[0][0], 0, wM[0][2]],
      [0, pM[1][1], wM[1][2]],
      [0, 0, 1]
    ]),
    key,
    data: { 
      clickBox: [-1, -1, 1, 1], 
      title: `Node ${key}`,
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
  return u('graph-node', newNodeData, [
    u('in-edge-node', inEdgeNodeData),
    u('out-edge-node', outEdgeNodeData),
  ]);
};
const canvasFrame = { worldMatrix: math.identity(3) };
const initState = (
  u('GraphViewport', [
    u('window', { worldMatrix: math.identity(3) }, [
      u('plane', { worldMatrix: M1 }, [
        translatedFrame(createNode(0), [0, -3]),
        translatedFrame(createNode(1), [0, 0]),
        translatedFrame(createNode(2), [0, 3]),
      ])
    ])
  ])
);

// create the app
const app = sources => {
  const reset$ = xs.periodic(3000).startWith(0);
  const sink = GraphViewport({ 
    ...sources,
    props: xs.of({ initState }),
  });
  const dom$ = xs.combine(reset$, sink.DOM).map(([i, dom]) => (
    h(`div.${i}`, { style: { height: '100%' } }, [dom])
  ));
  return {
    ...sink,
    DOM: dom$,
    debug: sources.state.stream,
  };
};

// run the app
run(withState(app), {
  viewport,
  preventDefault,
  DOM: makeDOMDriver('#app'),
  debug: l$ => l$.addListener({ next: console.log }),
});
