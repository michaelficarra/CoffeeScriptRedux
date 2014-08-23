CoffeeScript = require './module'
eachCode = require 'pegjs-each-code'

compile = (csCode, options = {}) ->
  csAST = CoffeeScript.parse "-> #{csCode.trimRight()}"
  if csAST.body.statements.length > 1
    throw new Error "inconsistent base indentation"
  jsAST = CoffeeScript.compile csAST, bare: yes, inScope: options.inScope
  jsAST.leadingComments = []
  jsAST.body = jsAST.body[0].expression.body.body.concat jsAST.body[1..]
  CoffeeScript.js jsAST

exports.use = (config) ->
  config.passes.transform.unshift (ast) ->
    ast.initializer.code = CoffeeScript.cs2js ast.initializer.code, bare: yes
    eachCode ast, (node, labels, ruleName) ->
      try
        node.code = compile node.code, inScope: labels
      catch error
        throw new Error """
          In the '#{ruleName}' rule:
          #{error.message}
        """
