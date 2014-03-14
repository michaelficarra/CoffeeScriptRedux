fs = require 'fs'
path = require 'path'
{concat, foldl} = require './functional-helpers'
{numberLines, humanReadable} = require './helpers'
{Preprocessor} = require './preprocessor'
{Optimiser} = require './optimiser'
{runMain} = require './run'
CoffeeScript = require './module'
Repl = require './repl'
{parse: parseOptions, generateHelp} = require './options'
cscodegen = try require 'cscodegen'
escodegen = try require 'escodegen'
esmangle = try require 'esmangle'

inspect = (o) -> (require 'util').inspect o, no, 9e9, yes


# parse options
try
  options = parseOptions process.argv
  positionalArgs = options._
catch e
  console.error e.message
  process.exit 1

# input validation
unless options.compile or options.js or options.sourceMap or options.parse or options.eval or options.cscodegen
  if not escodegen?
    options.compile = on
  else if positionalArgs.length
    options.eval = on
    options.input = positionalArgs.shift()
    additionalArgs = positionalArgs
  else
    options.repl = on

# dependencies
# - i (input) depends on o (output) when input is a directory
if options.input? and (fs.statSync options.input).isDirectory() and (not options.output? or (fs.statSync options.output)?.isFile())
  console.error 'Error: when --input is a directory, --output must be provided, and --output must not reference a file'
  process.exit 1

# - cscodegen depends on cscodegen
if options.cscodegen and not cscodegen?
  console.error 'Error: cscodegen must be installed to use --cscodegen'
  process.exit 1


output = (out) ->
  # --output
  if options.output
    fs.writeFile options.output, "#{out}\n", (err) ->
      throw err if err?
  else
    process.stdout.write "#{out}\n"


# start processing options
if options.help
  $0 = if process.argv[0] is 'node' then process.argv[1] else process.argv[0]
  $0 = path.basename $0

  console.log generateHelp interpolate: {$0}

else if options.version
  pkg = require './../package.json'
  console.log "CoffeeScript version #{pkg.version}"

else if options.repl
  CoffeeScript.register()
  do process.argv.shift
  do Repl.start

else
  # normal workflow

  input = ''
  inputName = options.input ? (options.cli and 'cli' or 'stdin')
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
        preprocessed = Preprocessor.process input, literate: options.literate
        console.error numberLines humanReadable preprocessed

    # parse
    try
      result = CoffeeScript.parse input,
        optimise: no
        raw: options.raw or options.sourceMap or options.sourceMapFile or options.eval
        inputSource: inputSource
        literate: options.literate
    catch e
      console.error e.message
      process.exit 1
    if options.debug and options.optimise and result?
      console.error '### PARSED CS-AST ###'
      console.error inspect result.toBasicObject()

    # optimise
    if options.optimise and result?
      result = Optimiser.optimise result

    # --parse
    if options.parse
      if result?
        output inspect result.toBasicObject()
        return
      else
        process.exit 1

    if options.debug and result?
      console.error "### #{if options.optimise then 'OPTIMISED' else 'PARSED'} CS-AST ###"
      console.error inspect result.toBasicObject()

    # cs code gen
    if options.cscodegen
      try result = cscodegen.generate result
      catch e
        console.error (e.stack or e.message)
        process.exit 1
      if result?
        output result
        return
      else
        process.exit 1

    # compile
    jsAST = CoffeeScript.compile result, bare: options.bare

    # --compile
    if options.compile
      if jsAST?
        output inspect jsAST
        return
      else
        process.exit 1

    if options.debug and jsAST?
      console.error "### COMPILED JS-AST ###"
      console.error inspect jsAST

    # minification
    if options.minify
      try
        jsAST = esmangle.mangle (esmangle.optimize jsAST), destructive: yes
      catch e
        console.error (e.stack or e.message)
        process.exit 1

    if options.sourceMap
      # source map generation
      try sourceMap = CoffeeScript.sourceMap jsAST, inputName, compact: options.minify
      catch e
        console.error (e.stack or e.message)
        process.exit 1
      # --source-map
      if sourceMap?
        output "#{sourceMap}"
        return
      else
        process.exit 1

    # js code gen
    try
      {code: js, map: sourceMap} = CoffeeScript.jsWithSourceMap jsAST, inputName, compact: options.minify
    catch e
      console.error (e.stack or e.message)
      process.exit 1

    # --js
    if options.js
      if options.sourceMapFile
        fs.writeFileSync options.sourceMapFile, "#{sourceMap}"
        sourceMappingUrl =
          if options.output
            path.relative (path.dirname options.output), options.sourceMapFile
          else
            options.sourceMapFile
        js = """
          #{js}

          //# sourceMappingURL=#{sourceMappingUrl}
        """
      output js
      return

    # --eval
    if options.eval
      CoffeeScript.register()
      process.argv = [process.argv[1], options.input].concat additionalArgs
      runMain input, js, jsAST, inputSource
      return

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
