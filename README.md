# graph-viewport

This module exports a [viewport.js](https://github.com/mvarble/fviewport.js) component which allows the user to manipulate a (directed) graph in the canvas.
The animation below showcases how one would maneuver the viewport and edit edge data.

![viewport example](https://raw.githubusercontent.com/mvarble/graph-viewport/master/example.gif)

## The State

The component requires `@cycle/state` logic as provided by the factory [Cycle.js](https://cycle.js.org/) functions.
The state at any given point should have the following shape.

```js
{
  type: 'root',
  id: // id of canvas being rendered,
  width: // (optional) width of canvas; inherited by parent.offsetWidth,
  height: // (optional) height of canvas; inherited by parent.offsetHeight,
  children: [{
    type: 'window',
    worldMatrix: // 3x3 identity initially suggested,
    children: [{
      type: 'plane',
      worldMatrix: // [[0.1, 0, 0], [0, 0.1, 0], [0, 0, 1]] initially suggested,
      children: // Array<graph-node>
    }]
  }]
}

{
  type: 'graph-node',
  key: // unique key among siblings,
  worldMatrix: // suggested to be a function of parent's worldMatrix,
  data: {
    clickBox: [-1, -1, 1, 1],
    title: // string for printed title,
    selected: // boolean for if it is selected,
    active: // boolean for if it is active,
  },
  children: [
    inEdgeNode // in-edge-node,
    ...outEdgeNodes // Array<out-edge-node>
  ]
}

{
  type: 'in-edge-node',
  worldMatrix: // suggested to be a function of parent's worldMatrix,
  data: {
    clickBox: [-4, -4, 4, 1],
    parentKey: // parent's key,
  }
}

{
  type: 'out-edge-node',
  key: // unique key among siblings,
  worldMatrix: // suggested to be a function of parent's worldMatrix,
  data: {
    clickBox: [-4, -4, 4, 1],
    parentKey: // parent's key,
  }
}
```

The component is not responsible for adding/removing nodes, but this can easily be implemented outside the component by implementing the appropriate reducers, provided as discussed below.

## API

### GraphViewport

This is the component which is responsible for editting a graph on the canvas.
The sources are as follows:

| Source | Description |
|---|---|
| canvas | a DOM object, as returned by the `select` method provided by the factory [Cycle.js](https://cycle.js.org/) DomDriver |
| props | a stream of an object with field `initState` which is a state like [above](#the-state) |
| state | the source that every [Cycle.js](https://cycle.js.org) app has, when mounted with `withState` as in `@cycle/state` |
| viewport | the object returned by the [ViewportDriver](https://github.com/mvarble/viewport.js#makeviewportdriver) |

The sinks are as follows:

| Sink | Description |
|---|---|
| state | the reducer stream, as requested in the `@cycle/state` paradigm |
| viewport | the `sources.state.stream` |
| preventDefault | a stream of events in which one should have a driver which adds a listener such that `listener.next` executes `event.preventDefault()` |

### renderGraphViewport

This is a function of signature `(canvas, state) => void` which can be provided to the [makeViewportDriver API](https://github.com/mvarble/viewport.js#makeviewportdriver).

### appendNode

This is a reducer which adds a `graph-node` to the state tree.

```js
newTree = appendNode(tree);
```

### deleteSelectedNodes

This is a reducer which deletes all of the `graph-nodes` which have `node.data.selected`.

```js
newTree = deleteSelectedNodes(tree);
```
