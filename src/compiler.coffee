{any, concatMap, difference, foldl1, map, nub, owns, union} = require './functional-helpers'
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
  genSymCounter = 0
  (pre) -> new JS.GenSym pre, ++genSymCounter


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
      when 0 then helpers.undef()
      when 1 then expr s.body[0]
      else new JS.SequenceExpression map s.body, expr
  else if s.instanceof JS.BreakStatement, JS.ContinueStatement, JS.ReturnStatement
    # TODO: better error
    throw new Error "pure statement in an expression"
  else if s.instanceof JS.ExpressionStatement
    s.expression
  else if s.instanceof JS.IfStatement
    consequent = expr (s.consequent ? helpers.undef())
    alternate = expr (s.alternate ? helpers.undef())
    new JS.ConditionalExpression s.test, consequent, alternate
  else if s.instanceof JS.ForInStatement, JS.WhileStatement
    accum = genSym 'accum'
    s.body = forceBlock s.body
    push = new JS.MemberExpression no, accum, new JS.Identifier 'push'
    s.body.body[s.body.body.length - 1] = stmt new JS.CallExpression push, [expr s.body.body[-1..][0]]
    block = new JS.BlockStatement [s, new JS.ReturnStatement accum]
    iife = new JS.FunctionExpression null, [accum], block
    new JS.CallExpression iife, [new JS.ArrayExpression []]
  else
    # TODO: comprehensive
    throw new Error "expr: #{s.type}"


declarationsNeededFor = (node) ->
  return [] unless node?
  nub if (node.instanceof JS.AssignmentExpression) and node.operator is '=' and node.left.instanceof JS.Identifier
    union [node.left], declarationsNeededFor node.right
  else if node.instanceof JS.ForInStatement then union [node.left], concatMap [node.right, node.body], declarationsNeededFor
  #TODO: else if node.instanceof JS.CatchClause then union [node.param], declarationsNeededFor node.body
  else if node.instanceof JS.FunctionExpression, JS.FunctionDeclaration then []
  else concatMap node.childNodes, (childName) ->
    # TODO: this should make use of an fmap method
    return [] unless node[childName]?
    if childName in node.listMembers
      concatMap node[childName], declarationsNeededFor
    else
      declarationsNeededFor node[childName]

collectIdentifiers = (node) -> nub switch
  when node.instanceof JS.Identifier then [node.name]
  when (node.instanceof JS.MemberExpression) and not node.computed
    collectIdentifiers node.object
  else concatMap node.childNodes, (childName) ->
    return [] unless node[childName]?
    if childName in node.listMembers
      concatMap node[childName], collectIdentifiers
    else
      collectIdentifiers node[childName]

makeReturn = (node) ->
  return new JS.ReturnStatement helpers.undef() unless node?
  if node.instanceof JS.BlockStatement
    new JS.BlockStatement [node.body[...-1]..., makeReturn node.body[-1..][0]]
  else if node.instanceof JS.SequenceExpression
    new JS.SequenceExpression [node.expressions[...-1]..., makeReturn node.expressions[-1..][0]]
  else if node.instanceof JS.IfStatement
    new JS.IfStatement node.test, (makeReturn node.consequent), makeReturn node.alternate
  else new JS.ReturnStatement expr node

# TODO: something like Optimiser.mayHaveSideEffects
needsCaching = (node) ->
  (envEnrichments node, []).length > 0 or
  (node.instanceof CS.FunctionApplications, CS.DoOp, CS.NewOp) or
  (any (difference node.childNodes, node.listMembers), (n) -> needsCaching node[n]) or
  (any node.listMembers, (n) -> any node[n], needsCaching)

forceBlock = (node) ->
  return node unless node?
  node = stmt node
  if node.instanceof JS.BlockStatement then node
  else new JS.BlockStatement [node]

makeVarDeclaration = (vars) ->
  decls = for v in vars
    new JS.VariableDeclarator v
  new JS.VariableDeclaration 'var', decls


helperNames = {}
helpers =
  isOwn: ->
    hop = new JS.MemberExpression no, (new JS.ObjectExpression []), new JS.Identifier 'hasOwnProperty'
    params = args = [(new JS.Identifier 'o'), new JS.Identifier 'p']
    functionBody = [new JS.CallExpression (new JS.MemberExpression no, hop, new JS.Identifier 'call'), args]
    new JS.FunctionDeclaration helperNames.isOwn, params, makeReturn new JS.BlockStatement map functionBody, stmt
  indexOf: ->
    member = new JS.Identifier 'member'
    list = new JS.Identifier 'list'
    i = genSym 'i'
    length = genSym 'length'
    varDeclaration = new JS.VariableDeclaration 'var', [
      new JS.VariableDeclarator i, new JS.Literal 0
      new JS.VariableDeclarator length, new JS.MemberExpression no, list, new JS.Identifier 'length'
    ]
    loopBody = new JS.IfStatement (new JS.BinaryExpression '&&', (new JS.BinaryExpression 'in', i, list), (new JS.BinaryExpression '===', (new JS.MemberExpression yes, list, i), member)), new JS.ReturnStatement i
    functionBody = [
      new JS.ForStatement varDeclaration, (new JS.BinaryExpression '<', i, length), (new JS.UpdateExpression '++', yes, i), loopBody
      new JS.UnaryExpression '-', new JS.Literal 1
    ]
    new JS.FunctionDeclaration helperNames.indexOf, [member, list], makeReturn new JS.BlockStatement map functionBody, stmt

enabledHelpers = []
for h, fn of helpers
  helperNames[h] = genSym h
  helpers[h] = do (h, fn) -> ->
    enabledHelpers.push fn()
    (helpers[h] = -> new JS.CallExpression helperNames[h], arguments).apply this, arguments

inlineHelpers =
  undef: -> new JS.UnaryExpression 'void', new JS.Literal 0

for h, fn of inlineHelpers
  helpers[h] = fn



class exports.Compiler

  @compile = => (new this).compile arguments...

  defaultRules = [
    # control flow structures
    [CS.Program, ({block, inScope, options}) ->
      return new JS.Program [] unless block?
      block = stmt block
      block =
        if block.instanceof JS.BlockStatement then block.body
        else [block]
      # helpers
      [].push.apply block, enabledHelpers
      # function wrapper
      # TODO: respect bare option
      block = [stmt new JS.CallExpression (new JS.MemberExpression no, (new JS.FunctionExpression null, [], new JS.BlockStatement block), new JS.Identifier 'call'), [new JS.ThisExpression]]
      # declare everything
      decls = nub concatMap block, declarationsNeededFor
      block.unshift makeVarDeclaration decls if decls.length > 0
      # generate node
      program = new JS.Program block
      program.comments = [
        type: 'Line'
        value: ' Generated by CoffeeScript 2.0.0' # TODO: auto-populate this
      ]
      program
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
    [CS.ForOf, ({keyAssignee, valAssignee, expression, filterExpr, block, compile}) ->
      # TODO: cache expression if isOwn
      block = forceBlock block
      if @filterExpr?
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', filterExpr), new JS.ContinueStatement
      if @valAssignee?
        block.body.unshift stmt new JS.AssignmentExpression '=', valAssignee, new JS.MemberExpression yes, expression, keyAssignee
      if @isOwn
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', helpers.isOwn (expr expression), keyAssignee), new JS.ContinueStatement
      new JS.ForInStatement keyAssignee, (expr expression), block
    ]
    [CS.While, ({condition, block}) -> new JS.WhileStatement (expr condition), forceBlock block]

    # data structures
    [CS.ArrayInitialiser, ({members}) -> new JS.ArrayExpression map members, expr]
    [CS.ObjectInitialiser, ({members}) -> new JS.ObjectExpression members]
    [CS.ObjectInitialiserMember, ({key, expression}) -> new JS.Property key, expr expression]
    [CS.Function, ({parameters, block}) -> new JS.FunctionExpression null, parameters, forceBlock makeReturn block]

    # more complex operations
    [CS.AssignOp, ({assignee, expression, compile}) -> switch
      when @assignee.instanceof CS.ArrayInitialiser
        assignments = []
        e = @expression
        if needsCaching @expression
          e = new CS.GenSym 'cache'
          assignments.push new CS.AssignOp e, @expression
        for m, i in @assignee.members
          assignments.push new CS.AssignOp m, new CS.DynamicMemberAccessOp e, new CS.Int i
        return helpers.undef() unless assignments.length
        compile foldl1 assignments, (a, b) -> new CS.SeqOp a, b
      when @assignee.instanceof CS.ObjectInitialiser
        assignments = []
        e = @expression
        if needsCaching @expression
          e = new CS.GenSym 'cache'
          assignments.push new CS.AssignOp e, @expression
        for m, i in @assignee.members
          assignments.push new CS.AssignOp m.expression, new CS.MemberAccessOp e, m.key.data
        return helpers.undef() unless assignments.length
        compile foldl1 assignments, (a, b) -> new CS.SeqOp a, b
      when @assignee.instanceof CS.Identifier, CS.GenSym, CS.MemberAccessOps
        new JS.AssignmentExpression '=', assignee, expr expression
      else
        throw new Error "compile: AssignOp: unassignable assignee: #{@assignee.className}"
    ]
    [CS.FunctionApplication, ({function: fn, arguments: args}) -> new JS.CallExpression (expr fn), map args, expr]
    [CS.NewOp, ({constructor, arguments: args}) -> new JS.NewExpression constructor, args]
    [CS.ConcatOp, ({left, right, ancestry}) ->
      plusOp = new JS.BinaryExpression '+', left, right
      unless ancestry[0].instanceof CS.ConcatOp
        leftmost = plusOp
        leftmost = leftmost.left while leftmost.left?.left
        leftmost.left = new JS.BinaryExpression '+', (new JS.Literal ''), leftmost.left
      plusOp
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
            else helpers.undef()
      compile new CS.FunctionApplication @expression, args
    ]
    [CS.Return, ({expression: e}) -> new JS.ReturnStatement expr e]
    [CS.Continue, -> new JS.ContinueStatement]

    # straightforward operators
    [CS.DivideOp, ({left, right}) -> new JS.BinaryExpression '/', (expr left), expr right]
    [CS.MultiplyOp, ({left, right}) -> new JS.BinaryExpression '*', (expr left), expr right]
    [CS.RemOp, ({left, right}) -> new JS.BinaryExpression '%', (expr left), expr right]
    [CS.PlusOp, ({left, right}) -> new JS.BinaryExpression '+', (expr left), expr right]
    [CS.SubtractOp, ({left, right}) -> new JS.BinaryExpression '-', (expr left), expr right]

    [CS.OfOp, ({left, right}) -> new JS.BinaryExpression 'in', (expr left), expr right]
    [CS.InOp, ({left, right}) -> helpers.indexOf (expr left), expr right]
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
    [CS.LogicalNotOp, ({expression: e}) -> new JS.UnaryExpression '!', expr e]

    # primitives
    [CS.Identifier, -> new JS.Identifier @data]
    [CS.GenSym, -> genSym @data]
    [CS.Bool, CS.Int, CS.Float, CS.String, -> new JS.Literal @data]
    [CS.Null, -> new JS.Literal null]
    [CS.Undefined, -> helpers.undef()]
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

    generateSymbols = do ->

      generatedSymbols = {}
      format = (pre, counter) -> "#{pre}$#{counter or ''}"

      generateName = (node, {usedSymbols, nsCounters}) ->
        if owns generatedSymbols, node.uniqueId
          # if we've already generated a name for this symbol, use it
          generatedSymbols[node.uniqueId]
        else
          # retrieve the next available counter in this symbol's namespace
          nsCounters[node.ns] = if owns nsCounters, node.ns then 1 + nsCounters[node.ns] else 0
          # avoid clashing with anything that is already in scope
          ++nsCounters[node.ns] while (formatted = format node.ns, nsCounters[node.ns]) in usedSymbols
          # save the name for future reference
          generatedSymbols[node.uniqueId] = formatted

      # TODO: comments
      handleNode = (node, state) ->
        {declaredSymbols, usedSymbols, nsCounters} = state
        newNode = if node.instanceof JS.GenSym
          newNode = new JS.Identifier generateName node, state
          usedSymbols.push newNode.name
          newNode
        else if node.instanceof JS.FunctionExpression, JS.FunctionDeclaration
          params = concatMap node.params, collectIdentifiers
          state.usedSymbols = nub [usedSymbols..., params...]
          state.nsCounters = {}
          state.nsCounters[k] = v for own k, v of nsCounters
          newNode = generateSymbols node, state
          declNames = nub difference (map (concatMap node.body.body, declarationsNeededFor), (id) -> id.name), declaredSymbols
          decls = map declNames, (name) -> new JS.Identifier name
          newNode.body.body.unshift makeVarDeclaration decls if decls.length > 0
          newNode
        else generateSymbols node, state
        state.declaredSymbols = union declaredSymbols, map (declarationsNeededFor newNode), (id) -> id.name
        newNode

      (node, state) ->
        # TODO: fmap?
        for childName in node.childNodes
          continue unless node[childName]?
          node[childName] =
            if childName in node.listMembers
              for n in node[childName]
                handleNode n, state
            else
              handleNode node[childName], state
        node

    defaultRule = ->
      throw new Error "compile: Non-exhaustive patterns in case: #{@className}"

    (ast) ->
      rules = @rules
      jsAST = walk.call ast, -> (rules[@className] ? defaultRule).apply this, arguments
      generateSymbols jsAST,
        declaredSymbols: []
        usedSymbols: collectIdentifiers jsAST
        nsCounters: {}
