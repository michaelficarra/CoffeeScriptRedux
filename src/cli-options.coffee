cscodegen = try require 'cscodegen'
escodegen = try require 'escodegen'
esmangle = try require 'esmangle'
{foldl} = require './functional-helpers'
path = require 'path'

requires = (mods...)->
  pass: mods.every (mod)-> eval(mod) isnt null
  toString: -> "Requires #{(mods.map (mod)-> "#{mod} [#{if eval(mod) is null then 'not-ok' else 'ok'}]").join 'and'}"

# initialise options
optionArguments = [
  [['optimise'    ],  on, 'enable optimisations (default: on)']
  [['debug'       ], off, 'output intermediate representations on stderr for debug']
  [['raw'         ], off, 'preserve source position and raw parse information']
  [['version', 'v'], off, 'display the version number']
  [['help'        ], off, 'display this help message']

  # requires escodegen
  [['bare',    'b'],            off, 'omit the top-level function wrapper'              , requires 'escodegen']
  [['eval',    'e'],            off, 'evaluate compiled JavaScript'                     , requires 'escodegen']
  [['repl'        ],            off, 'run an interactive CoffeeScript REPL'             , requires 'escodegen']
  [['include-source-reference'], on, 'append sourceURL or sourceMappingURL in js output', requires 'escodegen']

  # requires escodegen and esmangle
  [['minify',  'm'], off, 'run compiled javascript output through a JS minifier'        , requires 'escodegen', 'esmangle']

]

parameterArguments = [
  [['parse',   'p'], 'FILE', 'output a JSON-serialised AST representation of the input']
  [['compile', 'c'], 'FILE', 'output a JSON-serialised AST representation of the output']
  [['cli'         ], 'INPUT', 'pass a string from the command line as input']
  [['input',   'i'], 'FILE' , 'file to be used as input instead of STDIN']
  [['nodejs'      ], 'OPTS' , 'pass options through to the node binary']
  [['output',  'o'], 'FILE' , 'file to be used as output instead of STDIN']
  [['watch',   'w'], 'FILE' , 'watch the given file/directory for changes']

  # requires escodegen
  [['js',      'j'], 'FILE', 'generate JavaScript output'                                      , requires 'escodegen']
  [['source-map'  ], 'FILE', 'generate source map'                                             , requires 'escodegen']
  [['normalize-urls'], '', 'normalize URL references to be absolute from provided directory' , requires 'escodegen']

  # requires escodegen and esmangle
  [['require', 'I'], 'FILE' , 'require a library before a script is executed', requires 'escodegen', 'esmangle']

  # requires cscodegen
  [['cscodegen', 'f'], off, 'output cscodegen-generated CoffeeScript code'   , requires 'cscodegen']
]



writeVersion = ->
  pkg = require './../../package.json'
  console.log "CoffeeScript version #{pkg.version}"

writeHelp = (_args)->
  $0 = if _args[0] is 'node' then _args[1] else _args[0]
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

options = {}


exports.process = (_args)->
  # clone args
  args = _args[1 + (process.argv[0] is 'node') ..]

  # ignore args after --
  options.additionalArgs = []
  if '--' in args then options.additionalArgs = (args.splice (args.indexOf '--'), 9e9)[1..]

  optionMap = {}

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

  # help and version
  if options.help
    writeHelp _args
    process.exit 0

  if options.version
    writeVersion()
    process.exit 0


  # arguments validation
  outputTypeDirectedToStdOut = no
  for outputType in ['parse','compile', 'js', 'source-map', 'cscodegen']
    if options[outputType] in ['FILE', '', '-', '(stdout)', 'STDOUT']
      throw Error "Multiple output types cannot write to STDOUT. Provide either --#{outputTypeDirectedToStdOut} or --#{outputType} with an output file path." if outputTypeDirectedToStdOut
      options[outputType] = '(stdout)'
      outputTypeDirectedToStdOut = outputType

  if options.eval and outputTypeDirectedToStdOut
    throw Error "--eval must have full use of STDOUT. Provide --#{outputTypeDirectedToStdOut} with an output file path."

  return options
