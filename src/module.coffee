{formatParserError} = require './helpers'
Nodes = require './nodes'
{Preprocessor} = require './preprocessor'
Parser = require './parser'
{Optimiser} = require './optimiser'
{Compiler} = require './compiler'
cscodegen = try require 'cscodegen'
escodegen = try require 'escodegen'


pkg = require './../../package.json'

escodegenFormatDefaults =
  indent:
    style: '  '
    base: 0
  renumber: yes
  hexadecimal: yes
  quotes: 'auto'
  parentheses: no

escodegenCompactDefaults =
  indent:
    style: ''
    base: 0
  renumber: yes
  hexadecimal: yes
  quotes: 'auto'
  escapeless: yes
  compact: yes
  parentheses: no
  semicolons: no


module.exports =

  Compiler: Compiler
  Optimiser: Optimiser
  Parser: Parser
  Preprocessor: Preprocessor
  Nodes: Nodes

  VERSION: pkg.version

  parse: (coffee, options = {}) ->
    try
      preprocessed = Preprocessor.processSync coffee
      parsed = Parser.parse preprocessed,
        raw: options.raw
        inputSource: options.inputSource
      if options.optimise then Optimiser.optimise parsed else parsed
    catch e
      throw e unless e instanceof Parser.SyntaxError
      throw new Error formatParserError preprocessed, e

  compile: (csAst, options) ->
    (Compiler.compile csAst, options).toBasicObject()

  # TODO
  cs: (csAst, options) ->
    # TODO: opt: format (default: nice defaults)

  jsWithSourceMap: (jsAst, name = 'unknown', options = {}) ->
    # TODO: opt: minify (default: no)
    throw new Error 'escodegen not found: run `npm install escodegen`' unless escodegen?
    unless {}.hasOwnProperty.call jsAst, 'type'
      jsAst = jsAst.toBasicObject()
    escodegen.generate jsAst,
      comment: not options.compact
      sourceMapWithCode: yes
      sourceMap: name
      format: if options.compact then escodegenCompactDefaults else options.format ? escodegenFormatDefaults

  js: (jsAst, options) -> (@jsWithSourceMap jsAst, null, options).code
  sourceMap: (jsAst, name, options) -> (@jsWithSourceMap jsAst, name, options).map

  # Equivalent to original CS compile
  cs2js: (input, options = {}) ->
    options.optimise ?= on
    csAST = CoffeeScript.parse input, options
    jsAST = CoffeeScript.compile csAST, bare: options.bare
    CoffeeScript.js jsAST, compact: options.compact or options.minify


CoffeeScript = module.exports.CoffeeScript = module.exports

if (process.title == 'node')
  noBrowserifyRequire = require
  noBrowserifyRequire './run'
