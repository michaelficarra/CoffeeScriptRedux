{concatMap, map, union} = require './functional-helpers'
{usedAsExpression, envEnrichments} = require './helpers'
CS = require './nodes'
JS = require './js-nodes'
exports = module?.exports ? this


statementNodes = [
  JS.BlockStatement
  JS.BreakStatement
  JS.ContinueStatement
  JS.DoWhileStatement
  JS.DebuggerStatement
  JS.EmptyStatement
  JS.ExpressionStatement
  JS.ForStatement
  JS.ForInStatement
  JS.FunctionDeclaration
  JS.LabeledStatement
  JS.ReturnStatement
  JS.SwitchStatement
  JS.ThrowStatement
  JS.TryStatement
  JS.VariableDeclaration
  JS.WhileStatement
  JS.WithStatement
]

toStatement = (node) ->
  if node.instanceof statementNodes...
  then node
  else new JS.ExpressionStatement node

seqToBlock = (seq) ->
  # TODO: maybe there's a better way
  walk = (seq) ->
    concatMap seq.expressions, (e) ->
      if e.instanceof JS.SequenceExpression then walk e
      else [new JS.ExpressionStatement e]
  new JS.BlockStatement walk seq


class exports.Compiler

  defaultRules = [
    [CS.Program, ({block}) ->
      block =
        if !block? then []
        else if block.instanceof JS.SequenceExpression then seq.expressions
        else if block.instanceof JS.BlockStatement then block.body
        else [toStatement block]
      new JS.Program block
    ]
    [CS.Block, ({statements}) ->
      switch statements.length
        when 0 then new JS.EmptyStatement
        when 1 then new JS.ExpressionStatement statements[0]
        else new JS.BlockStatement (map statements, (s) -> new JS.ExpressionStatement s)
    ]
    [CS.Function, ({parameters, block}) ->
      if block.instanceof JS.SequenceExpression
        block = seqToBlock block
      if block.instanceof JS.BlockStatement
        block.body[block.body.length - 1] = new JS.ReturnStatement block.body[block.body.length - 1].expression
      else
        block = new JS.BlockStatement [new JS.ReturnStatement block]
      new JS.FunctionExpression null, parameters, block
    ]
    [CS.SeqOp, ({left, right})->
      new JS.SequenceExpression [left, right]
    ]
    [CS.FunctionApplication, ({function: fn, arguments: args}) ->
      new JS.CallExpression fn, args
    ]
    [CS.Identifier, -> new JS.Identifier @data]
    [CS.Bool, CS.Int, CS.Float, CS.String, -> new JS.Literal @data]
    [CS.Null, -> new JS.Literal null]
    [CS.This, -> new JS.ThisExpression]
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
    # contents; make the necessary declarations and generate the symbols inside

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
            jsNode

      do ancestry.shift
      children.inScope = inScope
      children.ancestry = ancestry
      fn.call this, children

    defaultRule = ->
      throw new Error "compile: Non-exhaustive patterns in case: #{@className}"

    (ast) ->
      rules = @rules
      walk.call ast, -> (rules[@className] ? defaultRule).apply this, arguments
