fs = require 'fs'
path = require 'path'
{concat, foldl} = require './functional-helpers'
{numberLines, humanReadable} = require './helpers'
{Preprocessor} = require './preprocessor'
{Optimiser} = require './optimiser'
{runMain} = require './run'
CoffeeScript = require './module'
Repl = require './repl'
cscodegen = try require 'cscodegen'
escodegen = try require 'escodegen'
esmangle = try require 'esmangle'

inspect = (o) -> (require 'util').inspect o, no, 9e9, yes

# clone args
args = process.argv[1 + (process.argv[0] is 'node') ..]

# ignore args after --
additionalArgs = []
if '--' in args then additionalArgs = (args.splice (args.indexOf '--'), 9e9)[1..]

# initialise options
options = {}
optionMap = {}

optionArguments = [
  [['optimise'    ],  on, 'enable optimisations (default: on)']
  [['debug'       ], off, 'output intermediate representations on stderr for debug']
  [['raw'         ], off, 'preserve source position and raw parse information']
  [['version', 'v'], off, 'display the version number']
  [['help'        ], off, 'display this help message']
]

parameterArguments = [
  [['parse',   'p'], off, 'output a JSON-serialised AST representation of the input']
  [['compile', 'c'], off, 'output a JSON-serialised AST representation of the output']
  [['cli'         ], 'INPUT', 'pass a string from the command line as input']
  [['input',   'i'], 'FILE' , 'file to be used as input instead of STDIN']
  [['nodejs'      ], 'OPTS' , 'pass options through to the node binary']
  [['output',  'o'], 'FILE' , 'file to be used as output instead of STDIN']
  [['watch',   'w'], 'FILE' , 'watch the given file/directory for changes']
]

if escodegen?
  [].push.apply optionArguments, [
    [['bare',    'b'], off, 'omit the top-level function wrapper']
    [['eval',    'e'], off, 'evaluate compiled JavaScript']
    [['repl'        ], off, 'run an interactive CoffeeScript REPL']
    [['include-source-reference'], on, 'append sourceURL or sourceMappingURL in js output']
  ]
  [].push.apply parameterArguments, [
    [['js',      'j'], off, 'generate JavaScript output']
    [['source-map'  ], off, 'generate source map']
    [['normalize-urls'], '', 'normalize URL references to be absolute from provided directory']
  ]
  if esmangle?
    optionArguments.push [['minify',  'm'], off, 'run compiled javascript output through a JS minifier']
  parameterArguments.push [['require', 'I'], 'FILE' , 'require a library before a script is executed']

if cscodegen?
  parameterArguments.push [['cscodegen', 'f'], off, 'output cscodegen-generated CoffeeScript code']


shortOptionArguments = []
longOptionArguments = []
for opts in optionArguments
  options[opts[0][0]] = opts[1]
  for o in opts[0]
    optionMap[o] = opts[0][0]
    if o.length is 1 then shortOptionArguments.push o
    else if o.length > 1 then longOptionArguments.push o

shortParameterArguments = []
longParameterArguments = []
for opts in parameterArguments
  for o in opts[0]
    optionMap[o] = opts[0][0]
    if o.length is 1 then shortParameterArguments.push o
    else if o.length > 1 then longParameterArguments.push o


# define some regexps that match our arguments
reShortOptions = ///^ - (#{shortOptionArguments.join '|'})+ $///
reLongOption = ///^ -- (no-)? (#{longOptionArguments.join '|'}) $///
reShortParameter = ///^ - (#{shortParameterArguments.join '|'}) $///
reLongParameter = ///^ -- (#{longParameterArguments.join '|'}) $///
reShortOptionsShortParameter = ///
  ^ - (#{shortOptionArguments.join '|'})+
  (#{shortParameterArguments.join '|'}) $
///


# parse arguments
positionalArgs = []
while args.length
  arg = args.shift()
  if reShortOptionsShortParameter.exec arg
    args.unshift "-#{arg[1...-1]}", "-#{arg[-1..]}"
  else if reShortOptions.exec arg
    for o in arg[1..].split ''
      options[optionMap[o]] = on
  else if match = reLongOption.exec arg
    options[optionMap[match[2]]] = if match[1]? then off else on
  else if match = (reShortParameter.exec arg) ? reLongParameter.exec arg
    parameterIsPresent= args[0]? and !((reShortOptions.exec args[0]) ? (reLongOption.exec args[0]) ? (reShortParameter.exec args[0]) ? (reLongParameter.exec args[0]) ? (reShortOptionsShortParameter.exec args[0]))
    if parameterIsPresent
      options[optionMap[match[1]]] = args.shift()
    else
      options[optionMap[match[1]]] = ''
  else if match = /^(-.|--.*)$/.exec arg
    console.error "Unrecognised option '#{match[0].replace /'/g, '\\\''}'"
    process.exit 1
  else
    positionalArgs.push arg


outputTypeDirectedToStdOut = no
for outputType in ['parse','compile', 'js', 'source-map', 'cscodegen']
  if options[outputType] is ''
    throw Error "Multiple output types cannot write to STDOUT. Provide either --#{outputTypeDirectedToStdOut} or --#{outputType} with an output file path." if outputTypeDirectedToStdOut
    options[outputType] = '(stdout)'
    outputTypeDirectedToStdOut = outputType

if options.eval and outputTypeDirectedToStdOut
  throw Error "--eval must have full use of STDOUT. Provide --#{outputTypeDirectedToStdOut} with an output file path."

writeOutput = (type, contents)->
  throw Error "Failed to generate output for [#{type}]" if !contents?
  if options[type] is '(stdout)'
    console.log contents
  else
    outputFilename = options[type]
    fs.writeFile outputFilename, contents, (err) -> throw err if err?

[sourceReferenceRoot, sourceReferenceRootReplacement...] = (options['normalize-urls'] ? '').split ':'
sourceReferenceRootReplacement = if sourceReferenceRootReplacement? then sourceReferenceRootReplacement.join '' else ''
reSourceRoot = /// ( (?:^|") /?) #{sourceReferenceRoot} /? ///g
normalizeURLs = (content)-> content.replace reSourceRoot, "$1#{sourceReferenceRootReplacement}"


# start processing options
if options.help
  $0 = if process.argv[0] is 'node' then process.argv[1] else process.argv[0]
  $0 = path.basename $0
  maxWidth = 85

  wrap = (lhsWidth, input) ->
    rhsWidth = maxWidth - lhsWidth
    pad = (Array lhsWidth + 4 + 1).join ' '
    rows = while input.length
      row = input[...rhsWidth]
      input = input[rhsWidth..]
      row
    rows.join "\n#{pad}"

  formatOptions = (opts) ->
    opts = for opt in opts when opt.length
      if opt.length is 1 then "-#{opt}" else "--#{opt}"
    opts.sort (a, b) -> a.length - b.length
    opts.join ', '

  console.log """
    Usage:
      #{$0} FILE ARG* [-- ARG*]
      #{$0} OPT* [--repl] OPT*
      #{$0} OPT* -{-parse,p,-compile,c,-js,j,-cscodegen} OPT*
      #{$0} {OPT,ARG}* -{-eval,e} {OPT,ARG}* -- ARG*

  """

  optionRows = for opt in optionArguments
    [(formatOptions opt[0]), opt[2]]
  parameterRows = for opt in parameterArguments
    ["#{formatOptions opt[0]} #{opt[1]}", opt[2]]
  leftColumnWidth = foldl 0, [optionRows..., parameterRows...], (memo, opt) ->
    Math.max memo, opt[0].length

  rows = [optionRows..., parameterRows...]
  rows.sort (a, b) ->
    a = a[0]; b = b[0]
    if a[0..1] is '--' and b[0..1] isnt '--' then return 1
    if b[0..1] is '--' and a[0..1] isnt '--' then return -1
    if a.toLowerCase() < b.toLowerCase() then -1 else 1
  for row in rows
    console.log "  #{row[0]}#{(Array leftColumnWidth - row[0].length + 1).join ' '}  #{wrap leftColumnWidth, row[1]}"

  console.log """

    Unless instructed otherwise (--{input,watch,cli}), `#{$0}` will operate on stdin/stdout.
    When none of -{-parse,p,-compile,c,-js,j,-eval,e,-cscodegen,-repl} are given
      If positional arguments were given
        * --eval is implied
        * the first positional argument is used as an input filename
        * additional positional arguments are passed as arguments to the script
      Else --repl is implied
  """

else if options.version
  pkg = require './../../package.json'
  console.log "CoffeeScript version #{pkg.version}"

else if options.repl
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
      writeOutput 'source-map', normalizeURLs sourceMap

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
        if options['source-map'] and options['source-map'] isnt '(stdout)'
          jsOutput = "#{jsOutput}\n//@ sourceMappingURL=#{normalizeURLs options['source-map']}"
        else
          jsOutput = "#{jsOutput}\n//@ sourceURL=#{normalizeURLs options.input}"
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
