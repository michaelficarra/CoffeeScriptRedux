{} = require './functional-helpers'
{usedAsExpression} = require './helpers'
CS = require './nodes'
JS = require './js-nodes'
exports = module?.exports ? this

class exports.Compiler

  defaultRules = [
    [CS.Identifier, -> new JS.Identifier @data]
    [CS.Int, -> new JS.Literal @data.toString 10]
  ]

  constructor: ->
    @rules = {}
    for [ctors..., handler] in defaultRules
      for ctor in ctors
        @addRule ctor::className, handler

  addRule: (ctor, handler) ->
    @rules[ctor] = handler
    this

  compile: do ->
    # TODO: when you go through a scope bound, ask envEnrichments about the
    # contents and make the necessary declarations

    walk = (fn, inScope = [], ancestry = []) ->
      ancestry.unshift this
      children = {}

      for childName in @childNodes when @[childName]?
        children[childName] =
          if childName in @listMembers
            for member in @[childName]
              jsNode = walk.call member, fn, inScope, ancestry
              inScope = union inScope, envEnrichments member, inScope
              jsNode
          else
            child = @[childName]
            jsNode = walk.call child, fn, inScope, ancestry
            inScope = union inScope, envEnrichments child, inScope
            @[childName] = child

      do ancestry.shift
      children.inScope = children
      children.ancestry = ancestry
      fn.call this, children

    defaultRule = ->
      throw new Error "compile: Non-exhaustive patterns in case: #{@className}"

    (ast) ->
      rules = @rules
      walk.call ast, -> (rules[@className] ? defaultRule).apply this, arguments
