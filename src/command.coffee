fs = require 'fs'
path = require 'path'
{concat, foldl} = require './functional-helpers'
{numberLines, humanReadable} = require './helpers'
{Preprocessor} = require './preprocessor'
{Optimiser} = require './optimiser'
{runMain} = require './run'
CoffeeScript = require './module'
Repl = require './repl'
Jedediah = require 'jedediah'
cscodegen = try require 'cscodegen'
escodegen = try require 'escodegen'
esmangle = try require 'esmangle'

inspect = (o) -> (require 'util').inspect o, no, 9e9, yes

optionParser = new Jedediah

optionParser.addOption 'parse',   'p', off, 'output a JSON-serialised AST representation of the input'
optionParser.addOption 'compile', 'c', off, 'output a JSON-serialised AST representation of the output'
optionParser.addOption 'optimise'    ,  on, 'enable optimisations (default: on)'
optionParser.addOption 'debug'       , off, 'output intermediate representations on stderr for debug'
optionParser.addOption 'raw'         , off, 'preserve source position and raw parse information'
optionParser.addOption 'version', 'v', off, 'display the version number'
optionParser.addOption 'help'        , off, 'display this help message'

optionParser.addParameter 'cli'        , 'INPUT', 'pass a string from the command line as input'
optionParser.addParameter 'input',  'i', 'FILE' , 'file to be used as input instead of STDIN'
optionParser.addParameter 'nodejs'     , 'OPTS' , 'pass options through to the node binary'
optionParser.addParameter 'output', 'o', 'FILE' , 'file to be used as output instead of STDIN'
optionParser.addParameter 'watch',  'w', 'FILE' , 'watch the given file/directory for changes'

if escodegen?
  optionParser.addOption 'bare',  'b', off, 'omit the top-level function wrapper'
  optionParser.addOption 'js',    'j', off, 'generate JavaScript output'
  optionParser.addOption 'source-map', off, 'generate source map'
  optionParser.addOption 'eval',  'e', off, 'evaluate compiled JavaScript'
  optionParser.addOption 'repl'      , off, 'run an interactive CoffeeScript REPL'
  optionParser.addParameter 'source-map-file', 'FILE' , 'file used as output for source map when using --js'
  optionParser.addParameter 'require', 'I', 'FILE' , 'require a library before a script is executed'
  if esmangle?
    optionParser.addOption 'minify', 'm', off, 'run compiled javascript output through a JS minifier'

if cscodegen?
  optionParser.addOption 'cscodegen', 'f', off, 'output cscodegen-generated CoffeeScript code'


[options, positionalArgs] = optionParser.parse process.argv


# input validation

unless options.compile or options.js or options['source-map'] or options.parse or options.eval or options.cscodegen
  if not escodegen?
    options.compile = on
  else if positionalArgs.length
    options.eval = on
    options.input = positionalArgs.shift()
    additionalArgs = positionalArgs
  else
    options.repl = on

# mutual exclusions
# - p (parse), c (compile), j (js), source-map, e (eval), cscodegen, repl
if 1 isnt (options.parse ? 0) + (options.compile ? 0) + (options.js ? 0) + (options['source-map'] ? 0) + (options.eval ? 0) + (options.cscodegen ? 0) + (options.repl ? 0)
  console.error "Error: At most one of --parse (-p), --compile (-c), --js (-j), --source-map, --eval (-e), --cscodegen, or --repl may be used."
  process.exit 1

# - i (input), w (watch), cli
if 1 < options.input? + options.watch? + options.cli?
  console.error 'Error: At most one of --input (-i), --watch (-w), or --cli may be used.'
  process.exit 1

# dependencies
# - I (require) depends on e (eval)
if options.require? and not options.eval
  console.error 'Error: --require (-I) depends on --eval (-e)'
  process.exit 1

# - m (minify) depends on escodegen and esmangle and (c (compile) or e (eval))
if options.minify and not (options.js or options.eval)
  console.error 'Error: --minify does not make sense without --js or --eval'
  process.exit 1

# - b (bare) depends on escodegen and (c (compile) or e (eval)
if options.bare and not (options.compile or options.js or options['source-map'] or options.eval)
  console.error 'Error: --bare does not make sense without --compile, --js, --source-map, or --eval'
  process.exit 1

# - source-map-file depends on j (js)
if options['source-map-file'] and not options.js
  console.error 'Error: --source-map-file depends on --js'
  process.exit 1

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

  console.log "
  Usage: (OPT is interpreted by #{$0}, ARG is passed to FILE)

    #{$0} OPT* -{p,c,j,f} OPT*
      example: #{$0} --js --no-optimise <input.coffee >output.js
    #{$0} [-e] FILE {OPT,ARG}* [-- ARG*]
      example: #{$0} myfile.coffee arg0 arg1
    #{$0} OPT* [--repl] OPT*
      example: #{$0}

#{optionParser.help()}

  Unless given --input or --cli flags, `#{$0}` will operate on stdin/stdout.
  When none of --{parse,compile,js,source-map,eval,cscodegen,repl} are given,
    If positional arguments were given
      * --eval is implied
      * the first positional argument is used as an input filename
      * additional positional arguments are passed as arguments to the script
    Else --repl is implied
"

else if options.version
  pkg = require './../../package.json'
  console.log "CoffeeScript version #{pkg.version}"

else if options.repl
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
        console.error numberLines humanReadable Preprocessor.processSync input

    # parse
    try
      result = CoffeeScript.parse input,
        optimise: no
        raw: options.raw or options['source-map'] or options['source-map-file'] or options.eval
        inputSource: inputSource
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
        output inspect jsAST.toBasicObject()
        return
      else
        process.exit 1

    if options.debug and jsAST?
      console.error "### COMPILED JS-AST ###"
      console.error inspect jsAST.toBasicObject()

    # minification
    if options.minify
      try
        jsAST = esmangle.mangle (esmangle.optimize jsAST), destructive: yes
      catch e
        console.error (e.stack or e.message)
        process.exit 1

    if options['source-map']
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
      if options['source-map-file']
        fs.writeFileSync options['source-map-file'], "#{sourceMap}"
        js = """
          #{js}

          /*
          //@ sourceMappingURL=#{options['source-map-file']}
          */
        """
      output js
      return

    # --eval
    if options.eval
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
