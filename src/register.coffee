child_process = require 'child_process'
fs = require 'fs'
path = require 'path'

CoffeeScript = require './module'
{runModule} = require './run'

module.exports = not require.extensions['.coffee']?

require.extensions['.coffee'] ?= (module, filename) ->
  input = fs.readFileSync filename, 'utf8'
  csAst = CoffeeScript.parse input, raw: yes
  jsAst = CoffeeScript.compile csAst
  js = CoffeeScript.js jsAst
  runModule module, js, jsAst, filename

require.extensions['.litcoffee'] ?= (module, filename) ->
  input = fs.readFileSync filename, 'utf8'
  csAst = CoffeeScript.parse input, raw: yes, literate: yes
  jsAst = CoffeeScript.compile csAst
  js = CoffeeScript.js jsAst
  runModule module, js, jsAst, filename

# patch child_process.fork to default to the coffee binary as the execPath for coffee/litcoffee files
{fork} = child_process
unless fork.coffeePatched
  coffeeBinary = path.resolve 'bin', 'coffee'
  child_process.fork = (file, args = [], options = {}) ->
    if (path.extname file) in ['.coffee', '.litcoffee']
      if not Array.isArray args
        args = []
        options = args or {}
      options.execPath or= coffeeBinary
    fork file, args, options
  child_process.fork.coffeePatched = yes
