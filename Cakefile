fs = require 'fs'
path = require 'path'
util = require 'util'
{exec} = require 'child_process'
CoffeeScript = require 'coffee-script'

inspect = (o) -> util.inspect o, no, 2, yes

task 'build:full', (options, cb) ->
  invoke 'build:parser'
  invoke 'build'

task 'build', (options, cb) ->
  filename = path.join 'src', 'nodes.coffee'
  fs.readFile filename, (err, source) ->
    throw err if err
    js = CoffeeScript.compile source.toString(), {filename, header: yes}
    fs.writeFile (path.join 'lib', 'coffee-script', 'nodes.js'), js, cb

task 'build:parser', (options, cb) ->
  pegjs = require 'pegjs'
  filename = path.join 'src', 'grammar.pegjs'
  fs.readFile filename, (err, source) ->
    throw err if err
    parser = pegjs.buildParser source.toString(), trackLineAndColumn: yes
    fs.writeFile (path.join 'lib', 'coffee-script', 'parser.js'), parser.toSource(), cb

task 'test', (options, cb) ->

  global[name] = func for name, func of require 'assert'

  # See http://wiki.ecmascript.org/doku.php?id=harmony:egal
  egal = (a, b) ->
    if a is b
      a isnt 0 or 1/a is 1/b
    else
      a isnt a and b isnt b

  # A recursive functional equivalence helper; uses egal for testing equivalence.
  arrayEgal = (a, b) ->
    if egal a, b then yes
    else if a instanceof Array and b instanceof Array
      return no unless a.length is b.length
      return no for el, idx in a when not arrayEgal el, b[idx]
      yes

  global.eq      = (a, b, msg) -> ok egal(a, b), msg ? "#{inspect a} === #{inspect b}"
  global.arrayEq = (a, b, msg) -> ok arrayEgal(a,b), msg ? "#{inspect a} === #{inspect b}"

  # Run every test in the `test` folder, recording failures.
  fs.readdir 'test', (err, files) ->
    throw err if err
    for file in files when file.match /\.coffee$/i
      code = fs.readFileSync filename = path.join 'test', file
      CoffeeScript.run code.toString(), {filename}
    cb?()
