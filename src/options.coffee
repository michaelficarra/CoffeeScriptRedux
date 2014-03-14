optionator = require 'optionator'

module.exports = optionator
  prepend: """
  Usage: (OPT is interpreted by {{$0}}, ARG is passed to FILE)

    {{$0}} OPT* -{p,c,j,f} OPT*
      example: {{$0}} --js --no-optimise <input.coffee >output.js
    {{$0}} [-e] FILE {OPT,ARG}* [-- ARG*]
      example: {{$0}} myfile.coffee arg0 arg1
    {{$0}} OPT* [--repl] OPT*
      example: {{$0}}
  """
  append: """
  Unless given --input or --cli flags, `{{$0}}` will operate on stdin/stdout.
  When none of --{parse,compile,js,source-map,eval,cscodegen,repl} are given,
    If positional arguments were given
      * --eval is implied
      * the first positional argument is used as an input filename
      * additional positional arguments are passed as arguments to the script
    Else --repl is implied
  """
  options:
    [{
      heading: 'Options'
    }, {
      option: 'bare'
      alias: 'b'
      type: 'Boolean'
      description: 'omit the top-level function wrapper'
      dependsOn: ['or', 'compile', 'js', 'sourceMap', 'eval']
    }, {
      option: 'compile'
      alias: 'c'
      type: 'Boolean'
      description: 'output a JSON-serialised AST representation of the output'
    }, {
      option: 'eval'
      alias: 'e'
      type: 'Boolean'
      description: 'evaluate compiled JavaScript'
    }, {
      option: 'cscodegen'
      alias: 'f'
      type: 'Boolean'
      description: 'output cscodegen-generated CoffeeScript code'
    }, {
      option: 'input'
      alias: 'i'
      type: 'path::String'
      description: 'file to be used as input instead of STDIN'
    }, {
      option: 'require'
      alias: 'I'
      type: 'path::String'
      description: 'require a library before a script is executed'
      dependsOn: 'eval'
    }, {
      option: 'js'
      alias: 'j'
      type: 'Boolean'
      description: 'generate JavaScript output'
    }, {
      option: 'literate'
      alias: 'l'
      type: 'Boolean'
      description: 'treat the input as literate CoffeeScript code'
    }, {
      option: 'minify'
      alias: 'm'
      type: 'Boolean'
      description: 'run compiled javascript output through a JS minifier'
      dependsOn: ['or', 'js', 'eval']
    }, {
      option: 'output'
      alias: 'o'
      type: 'path::String'
      description: 'file to be used as output instead of STDOUT'
    }, {
      option: 'parse'
      alias: 'p'
      type: 'Boolean'
      description: 'output a JSON-serialised AST representation of the input'
    }, {
      option: 'version'
      alias: 'v'
      type: 'Boolean'
      description: 'display the version number'
    }, {
      option: 'watch'
      alias: 'w'
      type: 'path::String'
      description: 'watch the given file/directory for changes'
    }, {
      option: 'cli'
      type: 'input::String'
      description: 'pass a string from the command line as input'
    }, {
      option: 'debug'
      type: 'Boolean'
      description: 'output intermediate representations on stderr for debug'
    }, {
      option: 'help'
      type: 'Boolean'
      description: 'display this help message'
    }, {
      option: 'nodejs'
      type: 'args::String'
      description: 'pass options through to the node binary'
    }, {
      option: 'optimise'
      type: 'Boolean'
      default: 'true'
      description: 'enable optimisations'
    }, {
      option: 'raw'
      type: 'Boolean'
      description: 'preserve source position and raw parse information'
    }, {
      option: 'repl'
      type: 'Boolean'
      description: 'run an interactive CoffeeScript REPL'
    }, {
      option: 'source-map'
      type: 'Boolean'
      description: 'generate source map'
    }, {
      option: 'source-map-file'
      type: 'path::String'
      description: 'file used as output for source map when using --js'
      dependsOn: 'js'
    }]
  mutuallyExclusive: [
    ['parse', 'compile', 'js', 'source-map', 'eval', 'cscodegen', 'repl']
    ['input', 'watch', 'cli']
  ]
  helpStyle:
    maxPadFactor: 1.6
