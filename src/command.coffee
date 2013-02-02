fs = require 'fs'
path = require 'path'
{numberLines, humanReadable, inspect} = require './helpers'
{Preprocessor} = require './preprocessor'
{Optimiser} = require './optimiser'
{runMain} = require './run'
CoffeeScript = require './module'
Repl = require './repl'
optionsProcessor= require './cli-options'
cscodegen = try require 'cscodegen'
esmangle = try require 'esmangle'


options = optionsProcessor.process process.argv

# helper method to write out different output streams
writeOutput = (type, contents)->
  throw Error "Failed to generate output for [#{type}]" if !contents?
  if options[type] is '(stdout)'
    console.log contents
  else
    outputFilename = options[type]
    fs.writeFile outputFilename, contents, (err) -> throw err if err?

# helper method to update URL paths in some content
# to be relative to another URL
String.prototype.updateURLs = (path_to_modify)->
  content = this
  relativeTo: (base_path)->
    path_to_modify_parts = path_to_modify.split '/'
    base_path_parts = base_path.split '/'
    base_path_parts.pop()
    while path_to_modify_parts.length
      break if path_to_modify_parts[0] isnt base_path_parts[0]
      path_to_modify_parts.shift()
      base_path_parts.shift()
    for part in base_path_parts
      path_to_modify_parts.unshift '..'
    content.replace new RegExp(path_to_modify, 'g'), path_to_modify_parts.join '/'

if options.repl
  do Repl.start

else
  # normal workflow

  input = ''
  inputSource =
    if options.input? then fs.realpathSync options.input
    else options.cli and '(cli)' or '(stdin)'

  processInput = (err) ->

    throw err if err?
    result = null

    input = input.toString()
    # strip UTF BOM
    if 0xFEFF is input.charCodeAt 0 then input = input[1..]

    # preprocess
    if options.debug
      try
        console.error '### PREPROCESSED CS ###'
        console.error numberLines humanReadable Preprocessor.processSync input

    # parse
    try
      result = CoffeeScript.parse input,
        optimise: no
        raw: options.raw or options['source-map'] or options.eval
        inputSource: inputSource
    catch e
      console.error e.message
      process.exit 1

    if options.debug and options.optimise and result?
      console.error '### PARSED CS-AST ###'
      console.error inspect result.toJSON()

    # optimise
    if options.optimise and result?
      result = Optimiser.optimise result

      if options.debug
        console.error "### OPTIMISED CS-AST ###"
        console.error inspect result.toJSON()

    # --parse
    if options.parse
      writeOutput 'parse', inspect result.toJSON()

    # cs code gen
    if options.cscodegen
      try cscodegen_result = cscodegen.generate result
      catch e
        console.error (e.stack or e.message)
        process.exit 1
      writeOutput 'cscodegen', cscodegen_result

    # compile
    jsAST = CoffeeScript.compile result, bare: options.bare

    # --compile
    if options.compile
      writeOutput 'compile', inspect jsAST.toJSON()

    if options.debug
      console.error "### COMPILED JS-AST ###"
      console.error inspect jsAST.toJSON()

    # --source-map
    if options['source-map']
      try sourceMap = CoffeeScript.sourceMap jsAST, options.input ? (options.cli and 'cli' or 'stdin'), compact: options.minify
      catch e
        console.error (e.stack or e.message)
        process.exit 1
      # normalize paths in the sourceMap
      writeOutput 'source-map', sourceMap.updateURLs(options.input).relativeTo(options['source-map'])

    # destructive minification
    if options['minify-destructive']
      try
        jsAST = esmangle.mangle (esmangle.optimize jsAST.toJSON()), destructive: yes
      catch e
        console.error (e.stack or e.message)
        process.exit 1

    # js code gen
    try
      js = CoffeeScript.js jsAST, compact: options.minify
    catch e
      console.error (e.stack or e.message)
      process.exit 1

    # --js
    if options.js
      jsOutput = js
      if options.input? and options['include-source-reference']
        if options['source-map'] and options['source-map'] isnt '(stdout)' and options['js'] and options['js'] isnt '(stdout)'
          jsOutput = "#{jsOutput}\n//@ sourceMappingURL=#{options['source-map'].updateURLs(options['source-map']).relativeTo(options.js)}"
        else
          jsOutput = "#{jsOutput}\n//@ sourceURL=#{options.input}"
      writeOutput 'js', jsOutput

    # --eval
    else if options.eval
      runMain input, js, jsAST, inputSource

  # choose input source

  if options.input?
    fs.stat options.input, (err, stats) ->
      throw err if err?
      if stats.isDirectory()
        options.input = path.join options.input, 'index.coffee'
      fs.readFile options.input, (err, contents) ->
        throw err if err?
        input = contents
        do processInput
  else if options.watch?
    options.watch # TODO: watch
  else if options.cli?
    input = options.cli
    do processInput
  else
    process.stdin.on 'data', (data) -> input += data
    process.stdin.on 'end', processInput
    process.stdin.setEncoding 'utf8'
    do process.stdin.resume
