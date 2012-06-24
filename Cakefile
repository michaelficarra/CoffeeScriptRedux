fs = require 'fs'
path = require 'path'
util = require 'util'
{exec} = require 'child_process'
CoffeeScript = require 'coffee-script'


inspect = (o) -> util.inspect o, no, 2, yes

sh = (cmd, cb) ->
  proc = exec cmd, (err, stdout, stderr) ->
    process.stdout.write stdout if stdout
    process.stderr.write stderr if stderr
    throw err if err
    process.exit proc.exitCode if proc.exitCode
    cb? proc


task 'install', (options, cb) ->
  sh 'npm install -g .', cb

task 'build:full', (options, cb) ->
  proc = sh 'cake build:parser && cake build'
  cb? proc
  ## TODO: enhance cake
  #invoke 'build:parser', ->
  #  invoke 'build', cb
  ## TODO: after we have a stable parser, make this more like jashkenas's buld:full
  #invoke 'build', ->
  #  invoke 'build', ->
  #    invoke 'test', cb

task 'build', (options, cb) ->
  fs.readdir 'src', (err, files) ->
    throw err if err
    for file in files when '.coffee' is path.extname file
      inputFilename = path.join 'src', file
      outputFilename = path.join 'lib', 'coffee-script', "#{file[...-7]}.js"
      do (inputFilename, outputFilename) ->
        fs.readFile inputFilename, (err, source) ->
          throw err if err
          js = CoffeeScript.compile source.toString(), filename: inputFilename, header: yes
          fs.writeFile outputFilename, js, ->
            # TODO: `cb?()` when these all finish

task 'build:parser', (options, cb) ->
  pegjs = require 'pegjs'
  filename = path.join 'src', 'grammar.pegjs'
  fs.readFile filename, (err, source) ->
    throw err if err
    parser = pegjs.buildParser source.toString(), trackLineAndColumn: yes
    fs.writeFile (path.join 'lib', 'coffee-script', 'parser.js'), "module.exports = #{parser.toSource()}", cb

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
    # TODO: CPS
    for file in files when '.coffee' is path.extname file
      code = fs.readFileSync filename = path.join 'test', file
      CoffeeScript.run code.toString(), {filename}
    cb?()
