/**
 * utilities.js
 *
 * This module contains functions responsible for component management in the 
 * app
 */

// module dependencies: npm packages
import xs from 'xstream';
import flattenConcurrently from 'xstream/extra/flattenConcurrently';

/**
 * Dependent Components:
 *
 * We often read the state of the app to determine what components appear in the
 * app. To do this, we often have streams of component sinks or streams of lists 
 * thereof. The following utilities help with exposing said streams.
 */

// this wraps a reducer with a key so that it may be lifted
const keyReducer = key => (
  reducer$ => reducer$.map(reducer => ({ reducer, key }))
);

// this returns a sink in which each of the provided fields will be keyed
const keySink = (sink, key, keys) => Object.keys(sink).reduce(
  (acc, field) => (
    (keys.find(k => k === field)) 
      ? { ...acc, [field]: sink[field].compose(keyReducer(key)) }
      : { ...acc, [field]: sink[field] }
  ),
  {}
);

// This will take a list of sinks of the same signature and merge each of the 
// fields. The keys of the fields must be provided for the edge case of no sinks
const mergeSinks = (sinks, keys) => keys.reduce(
  (acc, key) => ({ ...acc, [key]: xs.merge(...sinks.map(s => s[key]))}), 
  {}
);

// when provided a stream of sinks, this will lift a sink stream
const extract = key => (stream$ => stream$.map(sink => sink[key]).flatten());

// when provided a stream of sinks, this will lift a sink stream concurrently
const extractConcurrently = key => (
  stream$ => stream$.map(sink => sink[key]).compose(flattenConcurrently)
);

// for each keyed reducer, this will create a reducer on the level of the state 
// of the parent
function liftReducer(field) {
  const lift = ({ key, reducer }) => (tree => {
    const treeCopy = { ...tree };
    treeCopy.children = [ ...treeCopy.children ];
    const index = treeCopy.children.findIndex(c => c.key === key);
    if (index >= 0) {
      treeCopy.children[index] = reducer(treeCopy.children[index]);
    }
    return treeCopy;
  });
  return stream$$ => stream$$.compose(extractConcurrently(field)).map(lift);
}
export {
  keyReducer,
  keySink,
  mergeSinks,
  extract,
  extractConcurrently,
  liftReducer,
};
