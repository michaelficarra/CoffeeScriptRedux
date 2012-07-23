fs = require 'fs'
{concat} = require './functional-helpers'
{Preprocessor} = require './preprocessor'
{Optimiser} = require './optimiser'
parser = require './parser'

inspect = (o) -> (require 'util').inspect o, no, 9e9, yes

cleanMarkers = (str) -> str.replace /\uEFEF|\uEFFE\uEFFF/g, ''

humanReadable = (str) ->
  (str.replace /\uEFEF/g, '(INDENT)').replace /\uEFFE\uEFFF/g, '(DEDENT)'

numberLines = (input, startLine = 1) ->
  lines = input.split '\n'
  padSize = ((lines.length + startLine - 1).toString 10).length
  numbered = for line, i in lines
    currLine = "#{i + startLine}"
    pad = (Array(padSize + 1).join '0')[currLine.length..]
    "#{pad}#{currLine} : #{lines[i]}"
  numbered.join '\n'

printParserError = (e) ->
  if e.found?
    line = (input.split '\n')[e.line - 1]
    e.column = (cleanMarkers ("#{line}\n").slice 0, e.column).length
  console.error humanReadable """
    Syntax error on line #{e.line}, column #{e.column}: unexpected #{if e.found? then inspect e.found else 'end of input'}
    """
  if e.found?
    console.error cleanMarkers line
    console.error "#{(Array e.column).join '-'}^"


# clone args
args = process.argv[1 + (process.argv[0] is 'node') ..]

# ignore args after --
additionalArgs = []
if '--' in args then additionalArgs = args.splice (args.indexOf '--'), 9e9


# initialise options
options = {}
optionMap = {}

optionArguments = [
  [['bare',    'b'], off, 'omit the top-level function wrapper']
  [['compile', 'c'], off, 'compile to JavaScript']
  [['eval',    'e'], off, 'evaluate compiled javascript']
  [['parse',   'p'], off, 'output a JSON-serialised AST representation of the input']
  [['ast',     'a'], off, 'output a JSON-serialised AST representation of the output']
  [['lint',    'l'], off, 'pass compiled javascript output through JavaScriptLint']
  [['minify',  'm'], off, 'run compiled javascript output through a JS minifier']
  [['repl'        ], off, 'run an interactive CoffeeScript REPL']
  [['help'        ], off, 'display this help message']
  [['optimise'    ],  on, 'enable optimisations (default: on)']
  [['version', 'v'], off, 'display the version number']
]

parameterArguments = [
  [['cli'         ], null, 'pass a string from the command line as input']
  [['input',   'i'], null, 'file to be used as input instead of STDIN']
  [['nodejs'      ], null, 'pass options through to the node binary']
  [['output',  'o'], null, 'file to be used as output instead of STDIN']
  [['require', 'I'], null, 'require a library before a script is executed']
  [['watch',   'w'], null, 'watch the given file/directory for changes']
]

# mutual exclusions
# - c (compile), e (eval), a (ast), p (parse), repl
# - i (input), w (watch), cli

# dependencies
# - I (require) depends on e (eval)
# - m (minify) depends on c (compile)
# - l (lint) depends on c (compile)
# - b (bare) depends on c (compile)
# - i (input) depends on o (output) when input is a directory

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
positionalArguments = []
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
    options[optionMap[match[1]]] = args.shift()
  else
    positionalArguments.push arg


# input validation
unless options.compile or options.ast or options.parse or options.repl
  options.eval = on

if 1 isnt options.compile + options.eval + options.ast + options.parse + options.repl
  console.error 'Error: At most one of --compile (-c), --eval (-e), --ast (-a), --parse (-p), or --repl may be used.'
  process.exit 1

if 1 < options.input? + options.watch? + options.cli?
  console.error 'Error: At most one of --input (-i), --watch (-w), or --cli may be used.'
  process.exit 1


# process exceptional flags

if options.help
  console.log '  Usage: coffee [options] -- [args]'
  console.log ''
  console.log '  Unless instructed otherwise, `coffee` will operate on stdin/stdout and eval its input'
  # TODO: enumerate options
  return

if options.version
  filename = (require 'path').join __dirname, '..', '..', 'package.json'
  fs.readFile filename, (err, pkg) ->
    throw err if err
    console.log "CoffeeScript version #{(JSON.parse pkg).version}"
  return

if options.repl
  # TODO: start repl
  return


# normal workflow

input = ''

processInput = (err) ->

  throw err if err?
  result = null
  console.log numberLines input.trim()

  # preprocess
  try input = Preprocessor.processSync input
  catch e
    console.error (e.stack or e.message)
    process.exit 1

  # parse
  try result = parser.parse input
  catch e
    throw e unless e instanceof parser.SyntaxError
    printParserError e
    process.exit 1

  if options.optimise and result?
    optimiser = new Optimiser
    try result = optimiser.optimise result
    catch e
      console.error (e.stack || e.message)
      process.exit 1

  if options.parse
    if result?
      console.log inspect result.toJSON()
      process.exit 0
    else
      process.exit 1

  # TODO: compile
  # TODO: code gen
  # TODO: lint
  # TODO: minify
  # TODO: eval


# choose input source

if options.input?
  # TODO: handle directories
  fs.readFile options.input, processInput
else if options.watch?
  # TODO
else if options.cli?
  input = options.cli
  do processInput
else
  process.stdin.on 'data', (data) -> input += data
  process.stdin.on 'end', processInput
  process.stdin.setEncoding 'utf8'
  do process.stdin.resume
