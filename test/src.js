import u from 'unist-builder';
import xs from 'xstream';
import fromEvent from 'xstream/extra/fromEvent';
import { run } from '@cycle/run';
import { withState } from '@cycle/state';
import { GraphViewport, renderGraphViewport } from '../index';
import { makeViewportDriver } from '@mvarble/viewport.js';
import { rotatedFrame, translatedFrame } from '@mvarble/frames.js';
import * as math from 'mathjs';
import GIFEncoder from 'gifencoder';
import { finished } from 'stream';

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
  u('root', { id: 'canvas' }, [
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
const app = sources => ({
  ...GraphViewport({ 
    ...sources, 
    canvas: { 
      events: name => fromEvent(document.getElementById('canvas'), name) 
    },
    props: xs.of({ initState }),
  }),
});

// run the app
run(withState(app), { viewport, preventDefault });

// build an animation
const encoder = new GIFEncoder(1200, 400);
const context = document.getElementById('canvas').getContext('2d');
encoder.start();
encoder.setRepeat(0);
encoder.setDelay(1000/24.);
encoder.setQuality(10);
xs.periodic(1000/24.).take(24 * 5).addListener({
  next: () => {
    console.log('frame');
    encoder.addFrame(context);
  },
  complete: () => {
    console.log('finishing animation');
    encoder.finish();
  }
});

const readStream = encoder.createReadStream();
const list = [];
readStream.on('data', (chunk) => list.push(chunk));
readStream.on('end', () => {
  const blob = new Blob(list, { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const image = document.createElement('img');
  image.src = url;
  document.body.appendChild(image);
});
