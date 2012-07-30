{any, concatMap, difference, foldl1, map, union} = require './functional-helpers'
{beingDeclared, usedAsExpression, envEnrichments} = require './helpers'
CS = require './nodes'
JS = require './js-nodes'
exports = module?.exports ? this


jsReserved = [
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements',
  'import', 'in', 'instanceof', 'interface', 'let', 'native', 'new', 'null', 'package', 'private',
  'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield'
]

statementNodes = [
  JS.BlockStatement
  JS.BreakStatement
  JS.ContinueStatement
  JS.DebuggerStatement
  JS.DoWhileStatement
  JS.EmptyStatement
  JS.ExpressionStatement
  JS.ForInStatement
  JS.ForStatement
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

genSym = do ->
  genSymCounters = {}
  format = (pre, n) -> "#{pre}$#{n}"
  (pre) ->
    for own existingPre, value of genSymCounters when pre is existingPre
      ++genSymCounters[pre]
      return format pre, value
    genSymCounters[pre] = 1
    format pre, 0

undef = new JS.UnaryExpression 'void', new JS.Literal 0

makeReturn = (node) ->
  return new JS.ReturnStatement undef unless node?
  if node.instanceof JS.BlockStatement
    new JS.BlockStatement [node.body[...-1]..., makeReturn node.body[-1..][0]]
  else if node.instanceof JS.SequenceExpression
    new JS.SequenceExpression [node.expressions[...-1]..., makeReturn node.expressions[-1..][0]]
  else new JS.ReturnStatement expr node

# TODO: something like Optimiser.mayHaveSideEffects
needsCaching = (node) ->
  (envEnrichments node, []).length > 0 or
  (node.instanceof CS.FunctionApplications, CS.DoOp, CS.NewOp) or
  (any (difference node.childNodes, node.listMembers), (n) -> needsCaching node[n]) or
  (any node.listMembers, (n) -> any node[n], needsCaching)

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
    switch s.body.length
      when 0 then undef
      when 1 then expr s.body[0]
      else new JS.SequenceExpression map s.body, expr
  else if s.instanceof JS.BreakStatement
    # TODO: throw error?
  else if s.instanceof JS.ExpressionStatement
    s.expression
  else if s.instanceof JS.IfStatement
    consequent = expr (s.consequent ? undef)
    alternate = expr (s.alternate ? undef)
    new JS.ConditionalExpression s.test, consequent, alternate
  else
    # TODO: comprehensive
    throw new Error "expr: #{s.type}"

forceBlock = (node) ->
  return node unless node?
  node = stmt node
  if node.instanceof JS.BlockStatement then node
  else new JS.BlockStatement [node]


class exports.Compiler

  @compile = => (new this).compile arguments...

  defaultRules = [
    # control flow structures
    [CS.Program, ({block, inScope}) ->
      return new JS.Program [] unless block?
      block = stmt block
      block =
        if block.instanceof JS.BlockStatement then block.body
        else [block]
      # declare everything
      if inScope.length > 0
        declarations = for v in inScope
          new JS.VariableDeclarator new JS.Identifier v
        declarator = new JS.VariableDeclaration declarations
        declarator.kind = 'var'
        block.unshift declarator
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
      new JS.IfStatement (expr condition), (forceBlock block), forceBlock elseBlock
    ]

    # data structures
    [CS.ArrayInitialiser, ({members}) -> new JS.ArrayExpression map members, expr]
    [CS.ObjectInitialiser, ({members}) -> new JS.ObjectExpression members]
    [CS.ObjectInitialiserMember, ({key, expression}) -> new JS.Property key, expr value]
    [CS.Function, ({parameters, block}) ->
      new JS.FunctionExpression null, parameters, forceBlock makeReturn block
    ]

    # more complex operations
    [CS.AssignOp, ({assignee, expression, compile}) -> switch
      when @assignee.instanceof CS.ArrayInitialiser
        assignments = []
        e = @expression
        if needsCaching @expression
          e = new CS.GenSym genSym 'cache'
          assignments.push new CS.AssignOp e, @expression
        for m, i in @assignee.members
          assignments.push new CS.AssignOp m, new CS.DynamicMemberAccessOp e, new CS.Int i
        return undef unless assignments.length
        compile foldl1 assignments, (a, b) -> new CS.SeqOp a, b
      when @assignee.instanceof CS.ObjectInitialiser
        assignments = []
        e = @expression
        if needsCaching @expression
          e = new CS.GenSym genSym 'cache'
          assignments.push new CS.AssignOp e, @expression
        for m, i in @assignee.members
          assignments.push new CS.AssignOp m.expression, new CS.MemberAccessOp e, m.key.data
        return undef unless assignments.length
        compile foldl1 assignments, (a, b) -> new CS.SeqOp a, b
      when @assignee.instanceof CS.Identifier, CS.GenSym, CS.MemberAccessOps
        assignment = new JS.AssignmentExpression assignee, expression
        assignment.operator = '='
        assignment
      else
        throw new Error "compile: AssignOp: unassignable assignee: #{@assignee.className}"
    ]
    [CS.FunctionApplication, ({function: fn, arguments: args}) -> new JS.CallExpression (expr fn), map args, expr]
    [CS.NewOp, ({constructor, arguments: args}) -> new JS.NewExpression constructor, args]
    ]
    [CS.MemberAccessOp, ({expression}) ->
      if @memberName in jsReserved then new JS.MemberExpression yes, expression, new JS.Literal @memberName
      else new JS.MemberExpression no, expression, new JS.Identifier @memberName
    ]
    [CS.DynamicMemberAccessOp, ({expression, indexingExpr}) -> new JS.MemberExpression yes, expression, indexingExpr]
    [CS.UnaryExistsOp, ({expression, inScope, compile}) ->
      nullTest = new JS.BinaryExpression '!=', (new JS.Literal null), expression
      if (expression.instanceof JS.Identifier) and expression.name not in inScope
        typeofTest = new JS.BinaryExpression '!==', (new JS.Literal 'undefined'), new JS.UnaryExpression 'typeof', expression
        new JS.BinaryExpression '&&', typeofTest, nullTest
      else nullTest
    ]
    [CS.DoOp, ({expression, compile}) ->
      args = []
      if @expression.instanceof CS.Function
        args = for param in @expression.parameters
          switch
            when param.instanceof CS.AssignOp then param.expression
            when param.instanceof CS.Identifier, CS.MemberAccessOp then param
            else (new CS.Undefined).g()
      compile new CS.FunctionApplication @expression, args
    ]
    [CS.Return, ({expression: e}) -> new JS.ReturnStatement expr e]

    # straightforward operators
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

    [CS.PreIncrementOp, ({expression: e}) -> new JS.UpdateExpression '++', yes, expr e]

    # primitives
    [CS.Identifier, CS.GenSym, -> new JS.Identifier @data]
    [CS.Bool, CS.Int, CS.Float, CS.String, -> new JS.Literal @data]
    [CS.Null, -> new JS.Literal null]
    [CS.Undefined, -> undef]
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
