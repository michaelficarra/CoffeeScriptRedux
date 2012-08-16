fs = require 'fs'
path = require 'path'
{inspect} = require 'util'

{Preprocessor} = require './preprocessor'
Parser = require './parser'
{Optimiser} = require './optimiser'
{Compiler} = require './compiler'
cscodegen = try require 'cscodegen'
escodegen = try require 'escodegen'
uglifyjs = try require 'uglify-js'


cleanMarkers = (str) -> str.replace /\uEFEF|\uEFFE\uEFFF/g, ''

humanReadable = (str) ->
  (str.replace /\uEFEF/g, '(INDENT)').replace /\uEFFE\uEFFF/g, '(DEDENT)'

formatParserError = (input, e) ->
  if e.found?
    line = (input.split '\n')[e.line - 1]
    e.column = (cleanMarkers ("#{line}\n")[..e.column]).length - 1
  message = humanReadable """
    Syntax error on line #{e.line}, column #{e.column}: unexpected #{if e.found? then inspect e.found else 'end of input'}
    """
  if e.found?
    message = "#{message}\n#{cleanMarkers line}\n#{(Array e.column).join '-'}^"
  message


CoffeeScript = null
packageJSON = JSON.parse fs.readFileSync (path.join __dirname, '..', '..', 'package.json'), 'utf8'

module.exports =

  VERSION: packageJSON.version

  parse: (coffee, options = {}) ->
    options.optimise ?= yes
    try
      parsed = Parser.parse Preprocessor.processSync coffee
      if options.optimise then Optimiser.optimise parsed else parsed
    catch e
      throw e unless e instanceof Parser.SyntaxError
      throw new Error formatParserError coffee, e

  compile: (csAst, options) ->
    Compiler.compile csAst, options

  cs: (csAst, options) ->
    # TODO: opt: format (default: nice defaults)

  js: (jsAst, options) ->
    # TODO: opt: minify (default: no)
    # TODO: opt: format (default: nice defaults)
    throw new Error 'escodegen not found: run `npm install escodegen`' unless escodegen?
    escodegen.generate jsAst,
      comment: yes
      format:
        indent:
          style: '  '
          base: 0
        renumber: yes
        hexadecimal: yes
        quotes: 'auto'
        parentheses: no

CoffeeScript = module.exports.CoffeeScript = module.exports


require.extensions['.coffee'] = (module, filename) ->
  input = fs.readFileSync filename, 'utf8'
  csAst = CoffeeScript.parse input
  jsAst = CoffeeScript.compile csAst
  js = CoffeeScript.js jsAst
  module._compile js, filename
