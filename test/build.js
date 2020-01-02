var fs = require('fs');
var browserify = require('browserify');
var babelify = require('babelify');

browserify({ debug: true })
  .transform(babelify, { presets: ['@babel/preset-env'] })
  .require('./test/src.js', { entry: true })
  .bundle()
  .on('error', function (err) { console.log(err.message) })
  .pipe(fs.createWriteStream('./test/dist.js'));
