# Node.js-specific support: module loading, sourceMapping errors

fs = require 'fs'
path = require 'path'
module = require 'module'
CoffeeScript = require './module'
{SourceMapConsumer} = require 'source-map'

# NodeJS / V8 have no support for transforming positions in stack traces using
# sourceMap, so we must monkey-patch Error to display CoffeeScript source
# positions.

# Ideally, this would happen in a way that is scalable to multiple compile-to-
# JS languages trying to do the same thing in the same NodeJS process. We can
# implement it as if there were an API, and then patch in support for that
# API. The following maybe should be in its own npm module that multiple
# compilers can include.

# The require.extensions hook adds a getSourceMap function to the module
# object that returns the sourceMap file content for that module. The modified
# stack trace formatter looks up the module by filename and uses the
# sourceMap.

patched = false
patchStackTrace = ->
  return if patched
  patched = true

  Error.prepareStackTrace = (err, stack) ->
    sourceFiles = {}

    getSourceMapping = (filename, line, column) ->
      mod = module._cache[filename]
      if mod and mod.getSourceMap
        sourceMap = sourceFiles[filename] ?= new SourceMapConsumer mod.getSourceMap()
        sourceMap.originalPositionFor {line, column}

    frames = stack.map (frame) ->
      try
        "  at #{formatSourcePosition frame, getSourceMapping}"
      catch e
        console.log e
        ''

    # TODO: Display a line of source? Not very useful, IMHO
    # "#{errorPos.line}: #{originalLine}"
    # "#{errorPos.line.toString().replace /./, '^'}: #{Array(errorPos.column).join '~'}^"
    
    [
      "ERROR: #{err.message}"
      ""
      frames.join '\n'
    ].join '\n'


# Based on http://v8.googlecode.com/svn/tags/3.9.9/src/messages.js
# Modified to handle sourceMap
formatSourcePosition = (frame, getSourceMapping) ->
  fileName = undefined
  fileLocation = ""

  if frame.isNative()
    fileLocation = "native"
  else if frame.isEval()
    fileName = frame.getScriptNameOrSourceURL()
    fileLocation = frame.getEvalOrigin()  unless fileName
  else
    fileName = frame.getFileName()

  if fileName
    line = frame.getLineNumber()
    column = frame.getColumnNumber()

    # Check for a sourceMap position
    if (source = getSourceMapping(fileName, line, column))
      fileLocation = "#{fileName}:#{source.line}:#{source.column}, <js>:#{line}:#{column}"
    else
      fileLocation = "#{fileName}:#{line}:#{column}"

  fileLocation = "unknown source"  unless fileLocation

  line = ""
  functionName = frame.getFunction().name
  addPrefix = true
  isConstructor = frame.isConstructor()
  isMethodCall = not (frame.isToplevel() or isConstructor)
  if isMethodCall
    methodName = frame.getMethodName()
    line += frame.getTypeName() + "."
    if functionName
      line += functionName
      line += " [as " + methodName + "]"  if methodName and (methodName isnt functionName)
    else
      line += methodName or "<anonymous>"
  else if isConstructor
    line += "new " + (functionName or "<anonymous>")
  else if functionName
    line += functionName
  else
    line += fileLocation
    addPrefix = false
  line += " (" + fileLocation + ")"  if addPrefix
  line

# Run JavaScript as a main program - resetting process.argv and module lookup paths
exports.runMain = (csSource, jsSource, jsAst, filename) ->
  mainModule = require.main

  # This is what jashkenas/coffee-script does. I'm not sure why we're patching
  # up the main (command.coffee) module object instead of making a new one.

  # Set the filename.
  mainModule.filename = process.argv[1] = filename

  # Clear the module cache.
  # TODO: does this actually do anything? This isn't the cache...
  mainModule.moduleCache and= {}

  # Add the module to the cache with the right name so getSourceMapping finds it
  module._cache[filename] = mainModule

  # Assign paths for node_modules loading
  mainModule.paths = require('module')._nodeModulePaths path.dirname filename

  runModule mainModule, jsSource, jsAst, filename

runModule = (module, jsSource, jsAst, filename) ->
  patchStackTrace()

  module.getSourceMap = ->
    CoffeeScript.sourceMap jsAst, filename

  module._compile jsSource, filename

require.extensions['.coffee'] = (module, filename) ->
  input = fs.readFileSync filename, 'utf8'
  csAst = CoffeeScript.parse input
  jsAst = CoffeeScript.compile csAst
  js = CoffeeScript.js jsAst

  runModule module, js, jsAst, filename