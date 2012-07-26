{concatMap, map, union} = require './functional-helpers'
{beingDeclared, usedAsExpression, envEnrichments} = require './helpers'
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
  JS.IfStatement
  JS.LabeledStatement
  JS.ReturnStatement
  JS.SwitchStatement
  JS.ThrowStatement
  JS.TryStatement
  JS.VariableDeclaration
  JS.WhileStatement
  JS.WithStatement
]

makeReturn = (node) ->
  if node.instanceof JS.BlockStatement
    new JS.BlockStatement [node.body[...-1]..., new JS.ReturnStatement expr node.body[node.body.length - 1]]
  else new JS.ReturnStatement expr node

stmt = (e) ->
  return e unless e?
  if e.instanceof statementNodes... then e
  else if e.instanceof JS.SequenceExpression
    walk = (seq) ->
      concatMap seq.expressions, (e) ->
        if e.instanceof JS.SequenceExpression then walk e
        else [stmt e]
    new JS.BlockStatement walk e
  #else if (e.instanceof JS.BinaryExpression) and e.operator is '&&'
  #  new JS.IfStatement (expr e.left), stmt e.right
  else if e.instanceof JS.ConditionalExpression
    new JS.IfStatement (expr e.test), (stmt e.consequent), stmt e.alternate
  else new JS.ExpressionStatement e

expr = (s) ->
  return s unless s?
  if not s.instanceof statementNodes... then s
  else if s.instanceof JS.BlockStatement
    new JS.SequenceExpression s.body
  else if s.instanceof JS.BreakStatement
    # TODO: throw error?
  else if s.instanceof JS.ExpressionStatement
    s.expression
  else if s.instanceof JS.IfStatement
    new JS.ConditionalExpression s.test, (expr s.consequent), expr s.alternate
  else
    # TODO: comprehensive
    throw new Error "expr: #{s.type}"


class exports.Compiler

  defaultRules = [
    [CS.Program, ({block}) ->
      return new JS.Program [] unless block?
      block = stmt block
      block =
        if block.instanceof JS.BlockStatement then block.body
        else [block]
      new JS.Program block
    ]
    [CS.Block, ({statements}) ->
      switch statements.length
        when 0 then new JS.EmptyStatement
        when 1 then new stmt statements[0]
        else new JS.BlockStatement map statements, stmt
    ]
    [CS.SeqOp, ({left, right})-> new JS.SequenceExpression [left, right]]
    [CS.Conditional, ({condition, block, elseBlock, compile}) ->
      block ?= compile new CS.Undefined
      elseBlock ?= compile new CS.Undefined
      new JS.ConditionalExpression (expr condition), (expr block), expr elseBlock
    ]
    [CS.FunctionApplication, ({function: fn, arguments: args}) ->
      new JS.CallExpression (expr fn), (map args, expr)
    ]
    [CS.ArrayInitialiser, ({members}) -> new JS.ArrayExpression map members, expr]
    [CS.Function, ({parameters, block}) ->
      block = makeReturn stmt block
      block = new JS.BlockStatement [block] unless block.instanceof JS.BlockStatement
      new JS.FunctionExpression null, parameters, block
    ]

    [CS.UnaryExistsOp, ({expression, inScope, compile}) ->
      nullTest = new JS.BinaryExpression '!=', (new JS.Literal null), expression
      if (expression.instanceof JS.Identifier) and expression.name not in inScope
        typeofTest = new JS.BinaryExpression '!==', (new JS.Literal 'undefined'), new JS.UnaryExpression 'typeof', expression
        new JS.BinaryExpression '&&', typeofTest, nullTest
      else nullTest
    ]

    [CS.DivideOp, ({left, right}) -> new JS.BinaryExpression '/', (expr left), expr right]
    [CS.MultiplyOp, ({left, right}) -> new JS.BinaryExpression '*', (expr left), expr right]
    [CS.RemOp, ({left, right}) -> new JS.BinaryExpression '%', (expr left), expr right]
    [CS.PlusOp, ({left, right}) -> new JS.BinaryExpression '+', (expr left), expr right]
    [CS.SubtractOp, ({left, right}) -> new JS.BinaryExpression '-', (expr left), expr right]

    [CS.OfOp, ({left, right}) -> new JS.BinaryExpression 'in', (expr left), expr right]
    [CS.InstanceofOp, ({left, right}) -> new JS.BinaryExpression 'instanceof', (expr left), expr right]

    [CS.LogicalAndOp, ({left, right}) -> new JS.BinaryExpression '&&', (expr left), expr right]
    [CS.LogicalOrOp, ({left, right}) -> new JS.BinaryExpression '||', (expr left), expr right]

    [CS.EQOp , ({left, right}) -> new JS.BinaryExpression '===', (expr left), expr right]
    [CS.NEQOp , ({left, right}) -> new JS.BinaryExpression '!==', (expr left), expr right]
    [CS.GTEOp , ({left, right}) -> new JS.BinaryExpression '>=', (expr left), expr right]
    [CS.GTOp , ({left, right}) -> new JS.BinaryExpression '>', (expr left), expr right]
    [CS.LTEOp , ({left, right}) -> new JS.BinaryExpression '<=', (expr left), expr right]
    [CS.LTOp , ({left, right}) -> new JS.BinaryExpression '<', (expr left), expr right]

    [CS.BitAndOp , ({left, right}) -> new JS.BinaryExpression '&', (expr left), expr right]
    [CS.BitOrOp , ({left, right}) -> new JS.BinaryExpression '|', (expr left), expr right]
    [CS.BitXorOp , ({left, right}) -> new JS.BinaryExpression '^', (expr left), expr right]
    [CS.LeftShiftOp , ({left, right}) -> new JS.BinaryExpression '<<', (expr left), expr right]
    [CS.SignedRightShiftOp , ({left, right}) -> new JS.BinaryExpression '>>', (expr left), expr right]
    [CS.UnsignedRightShiftOp , ({left, right}) -> new JS.BinaryExpression '>>>', (expr left), expr right]

    [CS.Identifier, -> new JS.Identifier @data]
    [CS.Bool, CS.Int, CS.Float, CS.String, -> new JS.Literal @data]
    [CS.Null, -> new JS.Literal null]
    [CS.Undefined, -> new JS.UnaryExpression 'void', new JS.Literal 0]
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

      if (ancestry[0]?.instanceof CS.Function, CS.BoundFunction) and this is ancestry[0].block
        inScope = union inScope, concatMap ancestry[0].parameters, beingDeclared

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

      children.inScope = inScope
      children.ancestry = ancestry
      children.compile = (node) ->
        walk.call node.g(), fn, inScope, ancestry

      do ancestry.shift
      fn.call this, children

    defaultRule = ->
      throw new Error "compile: Non-exhaustive patterns in case: #{@className}"

    (ast) ->
      rules = @rules
      walk.call ast, -> (rules[@className] ? defaultRule).apply this, arguments
