fs = require 'fs'
CoffeeScript = require './module'
{runModule} = require './run'

module.exports = not require.extensions['.coffee']?

require.extensions['.coffee'] ?= (module, filename) ->
  input = fs.readFileSync filename, 'utf8'
  csAst = CoffeeScript.parse input, raw: yes
  jsAst = CoffeeScript.compile csAst
  js = CoffeeScript.js jsAst

  runModule module, js, jsAst, filename
