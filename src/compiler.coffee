{any, concat, concatMap, difference, divMod, foldl1, map, nub, owns, span, union} = require './functional-helpers'
{beingDeclared, usedAsExpression, envEnrichments} = require './helpers'
CS = require './nodes'
JS = require './js-nodes'
exports = module?.exports ? this

# TODO: this whole file could use a general cleanup


jsReserved = [
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements',
  'import', 'in', 'instanceof', 'interface', 'let', 'native', 'new', 'null', 'package', 'private',
  'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'arguments', 'eval'
]


genSym = do ->
  genSymCounter = 0
  (pre) -> new JS.GenSym pre, ++genSymCounter


stmt = (e) ->
  return e unless e?
  if e.isStatement then e
  else if e.instanceof JS.SequenceExpression
    walk = (seq) ->
      concatMap seq.expressions, (e) ->
        if e.instanceof JS.SequenceExpression then walk e
        else [stmt e]
    new JS.BlockStatement walk e
  else if e.instanceof JS.ConditionalExpression
    # TODO: drop either the consequent or the alternate if they don't have side effects
    new JS.IfStatement (expr e.test), (stmt e.consequent), stmt e.alternate
  else new JS.ExpressionStatement e

expr = (s) ->
  return s unless s?
  if s.isExpression then s
  else if s.instanceof JS.BlockStatement
    switch s.body.length
      when 0 then helpers.undef()
      when 1 then expr s.body[0]
      else new JS.SequenceExpression map s.body, expr
  else if s.instanceof JS.ExpressionStatement
    s.expression
  else if s.instanceof JS.ThrowStatement
    new JS.CallExpression (new JS.FunctionExpression null, [], forceBlock s), []
  else if s.instanceof JS.IfStatement
    consequent = expr (s.consequent ? helpers.undef())
    alternate = expr (s.alternate ? helpers.undef())
    new JS.ConditionalExpression s.test, consequent, alternate
  else if s.instanceof JS.ForInStatement, JS.ForStatement, JS.WhileStatement
    accum = genSym 'accum'
    # TODO: remove accidental mutation like this in these helpers
    push = (x) -> stmt new JS.CallExpression (memberAccess accum, 'push'), [x]
    s.body = forceBlock s.body
    if s.body.body.length
      lastExpression = s.body.body[-1..][0]
      unless lastExpression.instanceof JS.ThrowStatement
        # WARN: more mutation!
        s.body.body[s.body.body.length - 1] = push expr lastExpression
    else
      s.body.body.push push helpers.undef()
    block = new JS.BlockStatement [s, new JS.ReturnStatement accum]
    iife = new JS.FunctionExpression null, [accum], block
    new JS.CallExpression (memberAccess iife, 'call'), [new JS.ThisExpression, new JS.ArrayExpression []]
  else if s.instanceof JS.SwitchStatement, JS.TryStatement
    block = new JS.BlockStatement [makeReturn s]
    iife = new JS.FunctionExpression null, [], block
    new JS.CallExpression (memberAccess iife, 'call'), [new JS.ThisExpression]
  else
    # TODO: comprehensive
    throw new Error "expr: Cannot use a #{s.type} as a value"

makeReturn = (node) ->
  return new JS.ReturnStatement unless node?
  if node.instanceof JS.BlockStatement
    new JS.BlockStatement [node.body[...-1]..., makeReturn node.body[-1..][0]]
  else if node.instanceof JS.SequenceExpression
    new JS.SequenceExpression [node.expressions[...-1]..., makeReturn node.expressions[-1..][0]]
  else if node.instanceof JS.IfStatement
    new JS.IfStatement node.test, (makeReturn node.consequent), if node.alternate? then makeReturn node.alternate else null
  else if node.instanceof JS.SwitchStatement
    new JS.SwitchStatement node.discriminant, map node.cases, makeReturn
  else if node.instanceof JS.SwitchCase
    return node unless node.consequent.length
    stmts = if node.consequent[-1..][0].instanceof JS.BreakStatement then node.consequent[...-1] else node.consequent
    new JS.SwitchCase node.test, [stmts[...-1]..., makeReturn stmts[-1..][0]]
  else if node.instanceof JS.TryStatement
    new JS.TryStatement (makeReturn node.block), (map node.handlers, makeReturn), if node.finalizer? then makeReturn node.finalizer else null
  else if node.instanceof JS.CatchClause
    new JS.CatchClause node.param, makeReturn node.body
  else if node.instanceof JS.ThrowStatement, JS.ReturnStatement, JS.BreakStatement, JS.ContinueStatement then node
  else if (node.instanceof JS.UnaryExpression) and node.operator is 'void' then new JS.ReturnStatement
  else new JS.ReturnStatement expr node


generateMutatingWalker = (fn) -> (node, args...) ->
  for childName in node.childNodes
    continue unless node[childName]?
    node[childName] =
      if childName in node.listMembers
        for n in node[childName]
          fn.apply n, args
      else
        fn.apply node[childName], args
  node

declarationsNeeded = (node) ->
  return [] unless node?
  if (node.instanceof JS.AssignmentExpression) and node.operator is '=' and node.left.instanceof JS.Identifier then [node.left]
  else if node.instanceof JS.ForInStatement then [node.left]
  #TODO: else if node.instanceof JS.CatchClause then [node.param]
  else []

declarationsNeededRecursive = (node) ->
  return [] unless node?
  # don't cross scope boundaries
  if node.instanceof JS.FunctionExpression, JS.FunctionDeclaration then []
  else union (declarationsNeeded node), concatMap node.childNodes, (childName) ->
    # TODO: this should make use of an fmap method
    return [] unless node[childName]?
    if childName in node.listMembers then concatMap node[childName], declarationsNeededRecursive
    else declarationsNeededRecursive node[childName]

collectIdentifiers = (node) -> nub switch
  when !node? then []
  when node.instanceof JS.Identifier then [node.name]
  when (node.instanceof JS.MemberExpression) and not node.computed
    collectIdentifiers node.object
  else concatMap node.childNodes, (childName) ->
    return [] unless node[childName]?
    if childName in node.listMembers
      concatMap node[childName], collectIdentifiers
    else
      collectIdentifiers node[childName]

# TODO: something like Optimiser.mayHaveSideEffects
needsCaching = (node) ->
  return no unless node?
  (envEnrichments node, []).length > 0 or
  (node.instanceof CS.FunctionApplications, CS.DoOp, CS.NewOp, CS.ArrayInitialiser, CS.ObjectInitialiser, CS.RegExp, CS.HeregExp, CS.PreIncrementOp, CS.PostIncrementOp, CS.PreDecrementOp, CS.PostDecrementOp) or
  (any (difference node.childNodes, node.listMembers), (n) -> needsCaching node[n]) or
  any node.listMembers, (n) -> any node[n], needsCaching

forceBlock = (node) ->
  return new JS.BlockStatement [] unless node?
  node = stmt node
  if node.instanceof JS.BlockStatement then node
  else new JS.BlockStatement [node]

makeVarDeclaration = (vars) ->
  vars.sort (a, b) ->
    a = a.name.toLowerCase()
    b = b.name.toLowerCase()
    if a < b then -1 else if a > b then 1 else 0
  decls = for v in vars
    new JS.VariableDeclarator v
  new JS.VariableDeclaration 'var', decls

memberAccess = (e, member) ->
  isIdentifierName = /^[$_a-z][$_a-z0-9]*$/i # this can be made more permissive
  if member in jsReserved or not isIdentifierName.test member
  then new JS.MemberExpression yes, (expr e), new JS.Literal member
  else new JS.MemberExpression no, (expr e), new JS.Identifier member

dynamicMemberAccess = (e, index) ->
  if (index.instanceof JS.Literal) and typeof index.value is 'string'
  then memberAccess e, index.value
  else new JS.MemberExpression yes, e, index

# TODO: rewrite this whole thing using the CS AST nodes
assignment = (assignee, expression, valueUsed = no) ->
  assignments = []
  switch
    when assignee.rest then # do nothing for right now
    when assignee.instanceof JS.ArrayExpression
      e = expression
      # TODO: only cache expression when it needs it
      #if valueUsed or @assignee.members.length > 1 and needsCaching @expression
      if valueUsed or assignee.elements.length > 1
        e = genSym 'cache'
        assignments.push new JS.AssignmentExpression '=', e, expression

      elements = assignee.elements

      for m, i in elements
        break if m.rest
        assignments.push assignment m, (dynamicMemberAccess e, new JS.Literal i), valueUsed

      if elements.length > 0
        # TODO: see if this logic can be combined with rest-parameter handling
        if elements[-1..][0].rest
          numElements = elements.length
          restName = elements[numElements - 1] = elements[numElements - 1].expression
          test = new JS.BinaryExpression '<=', (new JS.Literal numElements), memberAccess e, 'length'
          consequent = helpers.slice e, new JS.Literal (numElements - 1)
          alternate = new JS.ArrayExpression []
          assignments.push stmt new JS.AssignmentExpression '=', restName, new JS.ConditionalExpression test, consequent, alternate
        else if any elements, (p) -> p.rest
          restName = index = null
          for p, i in elements when p.rest
            restName = p.expression
            index = i
            break
          elements.splice index, 1
          numElements = elements.length
          size = genSym 'size'
          assignments.push new JS.AssignmentExpression '=', size, memberAccess e, 'length'
          test = new JS.BinaryExpression '>', size, new JS.Literal numElements
          consequent = helpers.slice e, (new JS.Literal index), new JS.BinaryExpression '-', size, new JS.Literal numElements - index
          assignments.push new JS.AssignmentExpression '=', restName, new JS.ConditionalExpression test, consequent, new JS.ArrayExpression []
          for p, i in elements[index...]
            assignments.push stmt new JS.AssignmentExpression '=', p, new JS.MemberExpression yes, e, new JS.BinaryExpression '-', size, new JS.Literal numElements - index - i
        if any elements, (p) -> p.rest
          throw new Error 'Positional destructuring assignments may not have more than one rest operator'

    when assignee.instanceof JS.ObjectExpression
      e = expression
      # TODO: only cache expression when it needs it
      #if valueUsed or @assignee.members.length > 1 and needsCaching @expression
      if valueUsed or assignee.properties.length > 1
        e = genSym 'cache'
        assignments.push new JS.AssignmentExpression '=', e, expression

      for m in assignee.properties
        propName = if m.key.instanceof JS.Identifier then new JS.Literal m.key.name else m.key
        assignments.push assignment m.value, (dynamicMemberAccess e, propName), valueUsed

    when assignee.instanceof JS.Identifier, JS.GenSym, JS.MemberExpression
      assignments.push new JS.AssignmentExpression '=', assignee, expr expression
    else
      throw new Error "compile: assignment: unassignable assignee: #{assignee.type}"
  switch assignments.length
    when 0 then if e is expression then helpers.undef() else expression
    when 1 then assignments[0]
    else new JS.SequenceExpression if valueUsed then [assignments..., e] else assignments

hasSoak = (node) -> switch
  when node.instanceof CS.SoakedFunctionApplication, CS.SoakedMemberAccessOp, CS.SoakedProtoMemberAccessOp, CS.SoakedDynamicMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp
    yes
  when node.instanceof CS.FunctionApplication
    hasSoak node.function
  when node.instanceof CS.MemberAccessOps
    hasSoak node.expression
  else
    no

generateSoak = do ->
  # this function builds a tuple containing
  # * a list of conjuncts for the conditional's test
  # * the expression to be used as the consequent
  fn = (node) -> switch
    when node.instanceof CS.MemberAccessOp, CS.ProtoMemberAccessOp
      [tests, e] = fn node.expression
      [tests, new node.constructor e, node.memberName]
    when node.instanceof CS.DynamicMemberAccessOp, CS.DynamicProtoMemberAccessOp
      [tests, e] = fn node.expression
      [tests, new node.constructor e, node.indexingExpr]
    when node.instanceof CS.FunctionApplication
      [tests, e] = fn node.function
      [tests, new CS.FunctionApplication e, node.arguments]
    when node.instanceof CS.SoakedFunctionApplication
      [tests, e] = fn node.function
      typeofTest = (e) -> new CS.EQOp (new CS.String 'function'), new CS.TypeofOp e
      if needsCaching e
        sym = new CS.GenSym 'cache'
        [[tests..., typeofTest new CS.AssignOp sym, e], new CS.FunctionApplication sym, node.arguments]
      else
        [[tests..., typeofTest e], new CS.FunctionApplication e, node.arguments]
    when node.instanceof CS.SoakedMemberAccessOp, CS.SoakedProtoMemberAccessOp, CS.SoakedDynamicMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp
      memberName = switch
        when node.instanceof CS.SoakedMemberAccessOp, CS.SoakedProtoMemberAccessOp then 'memberName'
        when node.instanceof CS.SoakedDynamicMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp then 'indexingExpr'
      ctor = switch
        when node.instanceof CS.SoakedMemberAccessOp then CS.MemberAccessOp
        when node.instanceof CS.SoakedProtoMemberAccessOp then CS.ProtoMemberAccessOp
        when node.instanceof CS.SoakedDynamicMemberAccessOp then CS.DynamicMemberAccessOp
        when node.instanceof CS.SoakedDynamicProtoMemberAccessOp then CS.DynamicProtoMemberAccessOp
      [tests, e] = fn node.expression
      if needsCaching e
        sym = new CS.GenSym 'cache'
        [[tests..., new CS.UnaryExistsOp new CS.AssignOp sym, e], new ctor sym, node[memberName]]
      else
        [[tests..., new CS.UnaryExistsOp e], new ctor e, node[memberName]]
    else
      [[], node]

  (node) ->
    [tests, e] = fn node
    new CS.Conditional (foldl1 tests, (memo, t) -> new CS.LogicalAndOp memo, t), e


helperNames = {}
helpers =
  extends: ->
    protoAccess = (e) -> memberAccess e, 'prototype'
    child = new JS.Identifier 'child'
    parent = new JS.Identifier 'parent'
    ctor = new JS.Identifier 'ctor'
    key = new JS.Identifier 'key'
    block = [
      new JS.ForInStatement key, parent, new JS.IfStatement (helpers.isOwn parent, key), f = # TODO: figure out how we can allow this
        stmt new JS.AssignmentExpression '=', (new JS.MemberExpression yes, child, key), new JS.MemberExpression yes, parent, key
      new JS.FunctionDeclaration ctor, [], new JS.BlockStatement [
        stmt new JS.AssignmentExpression '=', (memberAccess new JS.ThisExpression, 'constructor'), child
      ]
      new JS.AssignmentExpression '=', (protoAccess ctor), protoAccess parent
      new JS.AssignmentExpression '=', (protoAccess child), new JS.NewExpression ctor, []
      new JS.AssignmentExpression '=', (memberAccess child, '__super__'), protoAccess parent
      new JS.ReturnStatement child
    ]
    new JS.FunctionDeclaration helperNames.extends, [child, parent], new JS.BlockStatement map block, stmt
  construct: ->
    child = new JS.Identifier 'child'
    ctor = new JS.Identifier 'ctor'
    fn = new JS.Identifier 'fn'
    args = new JS.Identifier 'args'
    result = new JS.Identifier 'result'
    block = [
      new JS.VariableDeclaration 'var', [
        new JS.VariableDeclarator fn, new JS.FunctionExpression null, [], new JS.BlockStatement []
      ]
      new JS.AssignmentExpression '=', (memberAccess fn, 'prototype'), memberAccess ctor, 'prototype'
      new JS.VariableDeclaration 'var', [
        new JS.VariableDeclarator child, new JS.NewExpression fn, []
        new JS.VariableDeclarator result, new JS.CallExpression (memberAccess ctor, 'apply'), [child, args]
      ]
      new JS.ReturnStatement new JS.ConditionalExpression (new JS.BinaryExpression '===', result, new JS.CallExpression (new JS.Identifier 'Object'), [result]), result, child
    ]
    new JS.FunctionDeclaration helperNames.construct, [ctor, args], new JS.BlockStatement map block, stmt
  isOwn: ->
    hop = memberAccess (new JS.ObjectExpression []), 'hasOwnProperty'
    params = args = [(new JS.Identifier 'o'), new JS.Identifier 'p']
    functionBody = [new JS.CallExpression (memberAccess hop, 'call'), args]
    new JS.FunctionDeclaration helperNames.isOwn, params, makeReturn new JS.BlockStatement map functionBody, stmt
  in: ->
    member = new JS.Identifier 'member'
    list = new JS.Identifier 'list'
    i = new JS.Identifier 'i'
    length = new JS.Identifier 'length'
    varDeclaration = new JS.VariableDeclaration 'var', [
      new JS.VariableDeclarator i, new JS.Literal 0
      new JS.VariableDeclarator length, memberAccess list, 'length'
    ]
    loopBody = new JS.IfStatement (new JS.BinaryExpression '&&', (new JS.BinaryExpression 'in', i, list), (new JS.BinaryExpression '===', (new JS.MemberExpression yes, list, i), member)), new JS.ReturnStatement new JS.Literal yes
    functionBody = [
      new JS.ForStatement varDeclaration, (new JS.BinaryExpression '<', i, length), (new JS.UpdateExpression '++', yes, i), loopBody
      new JS.Literal no
    ]
    new JS.FunctionDeclaration helperNames.in, [member, list], makeReturn new JS.BlockStatement map functionBody, stmt

enabledHelpers = []
for h, fn of helpers
  helperNames[h] = genSym h
  helpers[h] = do (h, fn) -> ->
    enabledHelpers.push fn()
    (helpers[h] = -> new JS.CallExpression helperNames[h], arguments).apply this, arguments

inlineHelpers =
  exp: -> new JS.CallExpression (memberAccess (new JS.Identifier 'Math'), 'pow'), arguments
  undef: -> new JS.UnaryExpression 'void', new JS.Literal 0
  slice: -> new JS.CallExpression (memberAccess (memberAccess (new JS.ArrayExpression []), 'slice'), 'call'), arguments

for h, fn of inlineHelpers
  helpers[h] = fn



class exports.Compiler

  @compile = => (new this).compile arguments...

  # TODO: none of the default rules should need to use `compile`; fix it with functions
  defaultRules = [
    # control flow structures
    [CS.Program, ({body, inScope, options}) ->
      return new JS.Program [] unless body?
      block = stmt body
      block =
        if block.instanceof JS.BlockStatement then block.body
        else [block]
      # helpers
      [].push.apply block, enabledHelpers
      decls = nub concatMap block, declarationsNeededRecursive
      if decls.length > 0
        if options.bare
          block.unshift makeVarDeclaration decls
        else
          # add a function wrapper
          block = [stmt new JS.UnaryExpression 'void', new JS.CallExpression (memberAccess (new JS.FunctionExpression null, [], new JS.BlockStatement block), 'call'), [new JS.ThisExpression]]
      # generate node
      pkg = require (require 'path').join __dirname, '..', '..', 'package.json'
      program = new JS.Program block
      program.leadingComments = [
        type: 'Line'
        value: " Generated by CoffeeScript #{pkg.version}"
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
    [CS.Conditional, ({condition, consequent, alternate, ancestry}) ->
      if alternate?
        throw new Error 'Conditional with non-null alternate requires non-null consequent' unless consequent?
        alternate = forceBlock alternate unless alternate.instanceof JS.IfStatement
      if alternate? or ancestry[0]?.instanceof CS.Conditional
        consequent = forceBlock consequent
      inspect = (o) -> require('util').inspect o, no, 2, yes
      new JS.IfStatement (expr condition), (stmt consequent), alternate
    ]
    [CS.ForIn, ({valAssignee, keyAssignee, target, step, filter, body}) ->
      i = genSym 'i'
      length = genSym 'length'
      block = forceBlock body
      block.body.push stmt helpers.undef() unless block.body.length
      e = if needsCaching @target then genSym 'cache' else target
      varDeclaration = new JS.VariableDeclaration 'var', [
        new JS.VariableDeclarator i, new JS.Literal 0
        new JS.VariableDeclarator length, memberAccess e, 'length'
      ]
      unless e is target
        varDeclaration.declarations.unshift new JS.VariableDeclarator e, target
      if @filter?
        # TODO: if block only has a single statement, wrap it instead of continuing
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', filter), new JS.ContinueStatement
      if keyAssignee?
        block.body.unshift stmt assignment keyAssignee, i
      block.body.unshift stmt assignment valAssignee, new JS.MemberExpression yes, e, i
      new JS.ForStatement varDeclaration, (new JS.BinaryExpression '<', i, length), (new JS.UpdateExpression '++', yes, i), block
    ]
    [CS.ForOf, ({keyAssignee, valAssignee, target, filter, body}) ->
      block = forceBlock body
      block.body.push stmt helpers.undef() unless block.body.length
      e = if @isOwn and needsCaching @target then genSym 'cache' else expr target
      if @filter?
        # TODO: if block only has a single statement, wrap it instead of continuing
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', filter), new JS.ContinueStatement
      if valAssignee?
        block.body.unshift stmt assignment valAssignee, new JS.MemberExpression yes, e, keyAssignee
      if @isOwn
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', helpers.isOwn e, keyAssignee), new JS.ContinueStatement
      right = if e is target then e else new JS.AssignmentExpression '=', e, target
      new JS.ForInStatement keyAssignee, right, block
    ]
    [CS.While, ({condition, body}) -> new JS.WhileStatement (expr condition), forceBlock body]
    [CS.Switch, ({expression, cases, alternate}) ->
      cases = concat cases
      unless expression?
        expression = new JS.Literal false
        for c in cases
          c.test = new JS.UnaryExpression '!', c.test
      if alternate?
        cases.push new JS.SwitchCase null, [stmt alternate]
      for c in cases[...-1] when c.consequent?.length > 0
        c.consequent.push new JS.BreakStatement
      new JS.SwitchStatement expression, cases
    ]
    [CS.SwitchCase, ({conditions, consequent}) ->
      cases = map conditions, (c) ->
        new JS.SwitchCase c, []
      block = stmt consequent
      block = if block?
        if block.instanceof JS.BlockStatement then block.body else [block]
      else []
      cases[cases.length - 1].consequent = block
      cases
    ]
    [CS.Try, ({body, catchAssignee, catchBody, finallyBody}) ->
      finallyBlock = if finallyBody? then forceBlock finallyBody else null
      e = genSym 'e'
      catchBlock = forceBlock catchBody
      if catchAssignee?
        catchBlock.body.unshift stmt assignment catchAssignee, e
      handlers = [new JS.CatchClause e, catchBlock]
      new JS.TryStatement (forceBlock body), handlers, finallyBlock
    ]
    [CS.Throw, ({expression}) -> new JS.ThrowStatement expression]

    # data structures
    [CS.Range, ({left: left_, right: right_}) ->
      # enumerate small integral ranges
      if ((@left.instanceof CS.Int) or  ((@left.instanceof CS.UnaryNegateOp) and  @left.expression.instanceof CS.Int)) and
      (  (@right.instanceof CS.Int) or ((@right.instanceof CS.UnaryNegateOp) and @right.expression.instanceof CS.Int))
        rawLeft = if @left.instanceof CS.UnaryNegateOp then -@left.expression.data else @left.data
        rawRight = if @right.instanceof CS.UnaryNegateOp then -@right.expression.data else @right.data
        if (Math.abs rawLeft - rawRight) <= 20
          range = if @isInclusive then [rawLeft..rawRight] else [rawLeft...rawRight]
          return new JS.ArrayExpression map range, (n) -> if n < 0 then new JS.UnaryExpression '-', new JS.Literal -n else new JS.Literal n

      accum = genSym 'accum'
      body = [stmt new JS.AssignmentExpression '=', accum, new JS.ArrayExpression []]

      if needsCaching left_
        left = genSym 'from'
        body.push stmt new JS.AssignmentExpression '=', left, left_
      else left = left_
      if needsCaching right_
        right = genSym 'to'
        body.push stmt new JS.AssignmentExpression '=', right, right_
      else right = right_

      i = genSym 'i'
      vars = new JS.VariableDeclaration 'var', [new JS.VariableDeclarator i, left]

      conditionTest = new JS.BinaryExpression '<=', left, right
      conditionConsequent = new JS.BinaryExpression (if @isInclusive then '<=' else '<'), i, right
      conditionAlternate = new JS.BinaryExpression (if @isInclusive then '>=' else '>'), i, right
      condition = new JS.ConditionalExpression conditionTest, conditionConsequent, conditionAlternate

      update = new JS.ConditionalExpression conditionTest, (new JS.UpdateExpression '++', yes, i), new JS.UpdateExpression '--', yes, i

      body.push new JS.ForStatement vars, condition, update, stmt new JS.CallExpression (memberAccess accum, 'push'), [i]
      body.push new JS.ReturnStatement accum
      new JS.CallExpression (memberAccess (new JS.FunctionExpression null, [], new JS.BlockStatement body), 'apply'), [new JS.ThisExpression, new JS.Identifier 'arguments']
    ]
    [CS.ArrayInitialiser, do ->
      groupMembers = (members) ->
        if members.length is 0 then []
        else
          [ys, zs] = span members, (x) -> not x.spread
          if ys.length is 0
            sliced = helpers.slice zs[0].expression
            [ys, zs] = [sliced, zs[1..]]
          else ys = new JS.ArrayExpression map ys, expr
          [ys].concat groupMembers zs
      ({members, compile}) ->
        if any members, (m) -> m.spread
          grouped = groupMembers members
          new JS.CallExpression (memberAccess grouped[0], 'concat'), grouped[1..]
        else new JS.ArrayExpression map members, expr
    ]
    [CS.Spread, ({expression}) -> {spread: yes, expression}]
    [CS.ObjectInitialiser, ({members}) -> new JS.ObjectExpression members]
    [CS.ObjectInitialiserMember, ({key, expression}) -> new JS.Property key, expr expression]
    [CS.DefaultParam, ({param, default: d}) -> {param, default: d}]
    [CS.Function, CS.BoundFunction, do ->

      handleParam = (param, original, block) -> switch
        when original.instanceof CS.Rest then param # keep these for special processing later
        when original.instanceof CS.Identifier then param
        when original.instanceof CS.MemberAccessOps, CS.ObjectInitialiser, CS.ArrayInitialiser
          p = genSym 'param'
          block.body.unshift stmt assignment param, p
          p
        when original.instanceof CS.DefaultParam
          block.body.unshift new JS.IfStatement (new JS.BinaryExpression '==', (new JS.Literal null), param.param), stmt new JS.AssignmentExpression '=', param.param, param.default
          handleParam.call this, param.param, original.param, block
        else throw new Error "Unsupported parameter type: #{original.className}"

      ({parameters, body, ancestry}) ->
        unless ancestry[0]?.instanceof CS.Constructor
          body = makeReturn body
        block = forceBlock body
        last = block.body[-1..][0]
        if (last?.instanceof JS.ReturnStatement) and not last.argument?
          block.body = block.body[...-1]

        parameters_ =
          if parameters.length is 0 then []
          else
            pIndex = parameters.length
            while pIndex--
              handleParam.call this, parameters[pIndex], @parameters[pIndex], block
        parameters = parameters_.reverse()

        if parameters.length > 0
          if parameters[-1..][0].rest
            numParams = parameters.length
            paramName = parameters[numParams - 1] = parameters[numParams - 1].expression
            test = new JS.BinaryExpression '<=', (new JS.Literal numParams), memberAccess (new JS.Identifier 'arguments'), 'length'
            consequent = helpers.slice (new JS.Identifier 'arguments'), new JS.Literal (numParams - 1)
            alternate = new JS.ArrayExpression []
            block.body.unshift stmt new JS.AssignmentExpression '=', paramName, new JS.ConditionalExpression test, consequent, alternate
          else if any parameters, (p) -> p.rest
            paramName = index = null
            for p, i in parameters when p.rest
              paramName = p.expression
              index = i
              break
            parameters.splice index, 1
            numParams = parameters.length
            numArgs = genSym 'numArgs'
            reassignments = new JS.IfStatement (new JS.BinaryExpression '>', (new JS.AssignmentExpression '=', numArgs, memberAccess (new JS.Identifier 'arguments'), 'length'), new JS.Literal numParams), (new JS.BlockStatement [
              stmt new JS.AssignmentExpression '=', paramName, helpers.slice (new JS.Identifier 'arguments'), (new JS.Literal index), new JS.BinaryExpression '-', numArgs, new JS.Literal numParams - index
            ]), new JS.BlockStatement [stmt new JS.AssignmentExpression '=', paramName, new JS.ArrayExpression []]
            for p, i in parameters[index...]
              reassignments.consequent.body.push stmt new JS.AssignmentExpression '=', p, new JS.MemberExpression yes, (new JS.Identifier 'arguments'), new JS.BinaryExpression '-', numArgs, new JS.Literal numParams - index - i
            block.body.unshift reassignments
          if any parameters, (p) -> p.rest
            throw new Error 'Parameter lists may not have more than one rest operator'

        performedRewrite = no
        if @instanceof CS.BoundFunction
          newThis = genSym 'this'
          rewriteThis = generateMutatingWalker ->
            if @instanceof JS.ThisExpression
              performedRewrite = yes
              newThis
            else if @instanceof JS.FunctionExpression, JS.FunctionDeclaration then this
            else rewriteThis this
          rewriteThis block

        fn = new JS.FunctionExpression null, parameters, block
        if performedRewrite
          new JS.SequenceExpression [
            new JS.AssignmentExpression '=', newThis, new JS.ThisExpression
            fn
          ]
        else fn
    ]
    [CS.Rest, ({expression}) -> {rest: yes, expression, isExpression: yes, isStatement: yes}]

    # TODO: comment
    [CS.Class, ({nameAssignee, parent, name, ctor, body, compile}) ->
      args = []
      params = []
      parentRef = genSym 'super'
      block = forceBlock body
      if (name.instanceof JS.Identifier) and name.name in jsReserved
        name = genSym name.name

      if ctor?
        # TODO: I'd really like to avoid searching for the constructor like this
        for c, i in block.body when c.instanceof JS.FunctionDeclaration
          ctorIndex = i
          break
        block.body.splice ctorIndex, 1, ctor
      else
        ctor = new JS.FunctionDeclaration name, [], new JS.BlockStatement []
        ctorIndex = 0
        block.body.unshift ctor
      ctor.id = name
      # handle external constructors
      if @ctor? and not @ctor.expression.instanceof CS.Functions
        ctorRef = genSym 'externalCtor'
        ctor.body.body.push makeReturn new JS.CallExpression (memberAccess ctorRef, 'apply'), [new JS.ThisExpression, new JS.Identifier 'arguments']
        block.body.splice ctorIndex, 0, stmt new JS.AssignmentExpression '=', ctorRef, expr compile @ctor.expression

      if @boundMembers.length > 0
        instance = genSym 'instance'
        for protoAssignOp in @boundMembers
          memberName = protoAssignOp.assignee.data.toString()
          ps = (genSym() for _ in protoAssignOp.expression.parameters)
          member = memberAccess new JS.ThisExpression, memberName
          protoMember = memberAccess (memberAccess name, 'prototype'), memberName
          fn = new JS.FunctionExpression null, ps, new JS.BlockStatement [
            makeReturn new JS.CallExpression (memberAccess protoMember, 'apply'), [instance, new JS.Identifier 'arguments']
          ]
          ctor.body.body.unshift stmt new JS.AssignmentExpression '=', member, fn
        ctor.body.body.unshift stmt new JS.AssignmentExpression '=', instance, new JS.ThisExpression

      if parent?
        params.push parentRef
        args.push parent
        block.body.unshift stmt helpers.extends name, parentRef
      block.body.push new JS.ReturnStatement new JS.ThisExpression

      rewriteThis = generateMutatingWalker ->
        if @instanceof JS.ThisExpression then name
        else if @instanceof JS.FunctionExpression, JS.FunctionDeclaration then this
        else rewriteThis this
      rewriteThis block

      iife = new JS.CallExpression (new JS.FunctionExpression null, params, block), args
      if nameAssignee? then assignment nameAssignee, iife else iife
    ]
    [CS.Constructor, ({expression}) ->
      tmpName = genSym 'class'
      if @expression.instanceof CS.Functions
        new JS.FunctionDeclaration tmpName, expression.params, forceBlock expression.body
      else
        new JS.FunctionDeclaration tmpName, [], new JS.BlockStatement []
    ]
    [CS.ClassProtoAssignOp, ({assignee, expression, compile}) ->
      if @expression.instanceof CS.BoundFunction
        compile new CS.ClassProtoAssignOp @assignee, new CS.Function @expression.parameters, @expression.body
      else
        protoMember = memberAccess (memberAccess new JS.ThisExpression, 'prototype'), @assignee.data
        new JS.AssignmentExpression '=', protoMember, expression
    ]

    # more complex operations
    [CS.AssignOp, ({assignee, expression, ancestry}) ->
      assignment assignee, expression, usedAsExpression this, ancestry
    ]
    [CS.CompoundAssignOp, ({assignee, expression}) ->
      op = switch @op
        when CS.LogicalAndOp::className         then '&&'
        when CS.LogicalOrOp::className          then '||'
        when CS.BitOrOp::className              then '|'
        when CS.BitXorOp::className             then '^'
        when CS.BitAndOp::className             then '&'
        when CS.LeftShiftOp::className          then '<<'
        when CS.SignedRightShiftOp::className   then '>>'
        when CS.UnsignedRightShiftOp::className then '>>>'
        when CS.PlusOp::className               then '+'
        when CS.SubtractOp::className           then '-'
        when CS.MultiplyOp::className           then '*'
        when CS.DivideOp::className             then '/'
        when CS.RemOp::className                then '%'
        when CS.ExpOp::className                then '**'
        else throw new Error 'Unrecognised compound assignment operator'
      # TODO: if assignee is an identifier, fail unless assignee is in scope
      if op in ['&&', '||']
        new JS.BinaryExpression op, assignee, new JS.AssignmentExpression '=', assignee, expr expression
      else if op is '**'
        new JS.AssignmentExpression '=', assignee, helpers.exp assignee, expr expression
      else new JS.AssignmentExpression "#{op}=", assignee, expression
    ]
    [CS.ExistsAssignOp, ({assignee, expression, inScope}) ->
      if (assignee.instanceof JS.Identifier) and assignee.name not in inScope
        throw new Error "the variable \"#{assignee.name}\" can't be assigned with ?= because it has not been defined."
      condition = new JS.BinaryExpression '!=', (new JS.Literal null), assignee
      new JS.ConditionalExpression condition, assignee, new JS.AssignmentExpression '=', assignee, expr expression
    ]
    [CS.ChainedComparisonOp, ({expression, compile}) ->
      return expression unless @expression.left.instanceof CS.ComparisonOps
      left = expression.left.right
      lhs = compile new CS.ChainedComparisonOp @expression.left
      if needsCaching @expression.left.right
        left = genSym 'cache'
        # WARN: mutation
        if @expression.left.left.instanceof CS.ComparisonOps
          lhs.right.right = new JS.AssignmentExpression '=', left, lhs.right.right
        else lhs.right = new JS.AssignmentExpression '=', left, lhs.right
      new JS.BinaryExpression '&&', lhs, new JS.BinaryExpression expression.operator, left, expression.right
    ]
    [CS.FunctionApplication, ({function: fn, arguments: args, compile}) ->
      if any args, (m) -> m.spread
        lhs = @function
        context = new CS.Null
        if needsCaching @function
          context = new CS.GenSym 'cache'
          lhs = if @function.instanceof CS.StaticMemberAccessOps
            new @function.constructor (new CS.AssignOp context, lhs.expression), @function.memberName
          else if @function.instanceof CS.DynamicMemberAccessOps
            new @function.constructor (new CS.AssignOp context, lhs.expression), @function.indexingExpr
          else new CS.AssignOp context, lhs
        else if lhs.instanceof CS.MemberAccessOps
          context = lhs.expression
        if @function.instanceof CS.ProtoMemberAccessOp, CS.DynamicProtoMemberAccessOp
          context = new CS.MemberAccessOp context, 'prototype'
        else if @function.instanceof CS.SoakedProtoMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp
          context = new CS.SoakedMemberAccessOp context, 'prototype'
        compile new CS.FunctionApplication (new CS.MemberAccessOp lhs, 'apply'), [context, new CS.ArrayInitialiser @arguments]
      else if hasSoak this then compile generateSoak this
      else new JS.CallExpression (expr fn), map args, expr
    ]
    [CS.SoakedFunctionApplication, ({compile}) -> compile generateSoak this]
    [CS.NewOp, ({ctor, arguments: args, compile}) ->
      if any args, (m) -> m.spread
        helpers.construct ctor, compile new CS.ArrayInitialiser @arguments
      else new JS.NewExpression ctor, map args, expr
    ]
    [CS.HeregExp, ({expression}) ->
      args = [expression]
      if flags = (flag for flag in ['g', 'i', 'm', 'y'] when @flags[flag]).join ''
        args.push new JS.Literal flags
      new JS.NewExpression (new JS.Identifier 'RegExp'), args
    ]
    [CS.RegExp, ->
      flags = (flag for flag in ['g', 'i', 'm', 'y'] when @flags[flag]).join ''
      # TODO: try/catch for invalid regexps
      re = new RegExp @data, flags
      new JS.Literal re
    ]
    [CS.ConcatOp, ({left, right, ancestry}) ->
      plusOp = new JS.BinaryExpression '+', (expr left), expr right
      unless ancestry[0].instanceof CS.ConcatOp
        leftmost = plusOp
        leftmost = leftmost.left while leftmost.left?.left?
        unless (leftmost.left.instanceof JS.Literal) and 'string' is typeof leftmost.left.value
          leftmost.left = new JS.BinaryExpression '+', (new JS.Literal ''), leftmost.left
      plusOp
    ]
    [CS.MemberAccessOp, CS.SoakedMemberAccessOp, ({expression, compile}) ->
      if hasSoak this then expr compile generateSoak this
      else memberAccess expression, @memberName
    ]
    [CS.ProtoMemberAccessOp, CS.SoakedProtoMemberAccessOp, ({expression, compile}) ->
      if hasSoak this then expr compile generateSoak this
      else memberAccess (memberAccess expression, 'prototype'), @memberName
    ]
    [CS.DynamicMemberAccessOp, CS.SoakedDynamicMemberAccessOp, ({expression, indexingExpr, compile}) ->
      if hasSoak this then expr compile generateSoak this
      else dynamicMemberAccess expression, indexingExpr
    ]
    [CS.DynamicProtoMemberAccessOp, CS.SoakedDynamicProtoMemberAccessOp, ({expression, indexingExpr, compile}) ->
      if hasSoak this then expr compile generateSoak this
      else dynamicMemberAccess (memberAccess expression, 'prototype'), indexingExpr
    ]
    [CS.Slice, ({expression, left, right}) ->
      args = if left? then [left] else if right? then [new JS.Literal 0] else []
      if right?
        args.push if @isInclusive
          if (right.instanceof JS.Literal) and typeof right.data is 'number'
          then new JS.Literal right.data + 1
          else new JS.BinaryExpression '+', (new JS.UnaryExpression '+', right), new JS.Literal 1
        else right
      new JS.CallExpression (memberAccess expression, 'slice'), args
    ]
    [CS.ExistsOp, ({left, right, inScope}) ->
      e = if needsCaching @left then genSym 'cache' else left
      condition = new JS.BinaryExpression '!=', (new JS.Literal null), e
      if (e.instanceof JS.Identifier) and e.name not in inScope
        condition = new JS.BinaryExpression '&&', (new JS.BinaryExpression '!==', (new JS.Literal 'undefined'), new JS.UnaryExpression 'typeof', e), condition
      node = new JS.ConditionalExpression condition, e, right
      if e is left then node
      else new JS.SequenceExpression [(new JS.AssignmentExpression '=', e, left), node]
    ]
    [CS.UnaryExistsOp, ({expression, inScope}) ->
      nullTest = new JS.BinaryExpression '!=', (new JS.Literal null), expression
      if (expression.instanceof JS.Identifier) and expression.name not in inScope
        typeofTest = new JS.BinaryExpression '!==', (new JS.Literal 'undefined'), new JS.UnaryExpression 'typeof', expression
        new JS.BinaryExpression '&&', typeofTest, nullTest
      else nullTest
    ]
    [CS.DoOp, ({expression, compile}) ->
      args = []
      if @expression.instanceof CS.Function
        args = for param, index in @expression.parameters
          switch
            when param.instanceof CS.DefaultParam
              @expression.parameters[index] = param.param
              param.default
            when param.instanceof CS.Identifier, CS.MemberAccessOp then param
            else helpers.undef()
      compile new CS.FunctionApplication @expression, args
    ]
    [CS.Return, ({expression: e}) -> new JS.ReturnStatement expr e]
    [CS.Break, -> new JS.BreakStatement]
    [CS.Continue, -> new JS.ContinueStatement]

    # straightforward operators
    [CS.ExpOp, ({left, right}) ->
      helpers.exp (expr left), expr right
    ]
    [CS.DivideOp, ({left, right}) -> new JS.BinaryExpression '/', (expr left), expr right]
    [CS.MultiplyOp, ({left, right}) -> new JS.BinaryExpression '*', (expr left), expr right]
    [CS.RemOp, ({left, right}) -> new JS.BinaryExpression '%', (expr left), expr right]
    [CS.PlusOp, ({left, right}) -> new JS.BinaryExpression '+', (expr left), expr right]
    [CS.SubtractOp, ({left, right}) -> new JS.BinaryExpression '-', (expr left), expr right]

    [CS.OfOp, ({left, right}) -> new JS.BinaryExpression 'in', (expr left), expr right]
    [CS.InOp, ({left, right}) ->
      if (right.instanceof JS.ArrayExpression) and right.elements.length < 5
        switch right.elements.length
          when 0
            if needsCaching @left
              # TODO: only necessary if value is used, which is almost always
              new JS.SequenceExpression [left, new JS.Literal false]
            else new JS.Literal false
          when 1
            new JS.BinaryExpression '===', left, right.elements[0]
          else
            if needsCaching @left
              helpers.in (expr left), expr right
            else
              comparisons = map right.elements, (e) -> new JS.BinaryExpression '===', left, e
              foldl1 comparisons, (l, r) -> new JS.BinaryExpression '||', l, r
      else
        helpers.in (expr left), expr right
    ]
    [CS.ExtendsOp, ({left, right}) -> helpers.extends (expr left), expr right]
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

    [CS.PreDecrementOp, ({expression: e}) -> new JS.UpdateExpression '--', yes, expr e]
    [CS.PreIncrementOp, ({expression: e}) -> new JS.UpdateExpression '++', yes, expr e]
    [CS.PostDecrementOp, ({expression: e}) -> new JS.UpdateExpression '--', no, expr e]
    [CS.PostIncrementOp, ({expression: e}) -> new JS.UpdateExpression '++', no, expr e]
    [CS.UnaryPlusOp, ({expression: e}) -> new JS.UnaryExpression '+', expr e]
    [CS.UnaryNegateOp, ({expression: e}) -> new JS.UnaryExpression '-', expr e]
    [CS.LogicalNotOp, ({expression: e}) -> new JS.UnaryExpression '!', expr e]
    [CS.BitNotOp, ({expression: e}) -> new JS.UnaryExpression '~', expr e]
    [CS.TypeofOp, ({expression: e}) -> new JS.UnaryExpression 'typeof', expr e]
    [CS.DeleteOp, ({expression: e}) -> new JS.UnaryExpression 'delete', expr e]

    # primitives
    [CS.Identifier, -> new JS.Identifier @data]
    [CS.GenSym, do ->
      symbols = []
      memos = []
      ->
        if this in symbols then memos[symbols.indexOf this]
        else
          symbols.push this
          memos.push memo = genSym @data
          memo
    ]
    [CS.Bool, CS.Int, CS.Float, CS.String, -> new JS.Literal @data]
    [CS.Null, -> new JS.Literal null]
    [CS.Undefined, -> helpers.undef()]
    [CS.This, -> new JS.ThisExpression]
    [CS.JavaScript, -> new JS.CallExpression (new JS.Identifier 'eval'), [new JS.Literal @data]]
  ]

  constructor: ->
    @rules = {}
    for [ctors..., handler] in defaultRules
      for ctor in ctors
        @addRule ctor, handler

  addRule: (ctor, handler) ->
    @rules[ctor::className] = handler
    this

  # TODO: comment
  compile: do ->
    walk = (fn, inScope, ancestry, options) ->

      if (ancestry[0]?.instanceof CS.Function, CS.BoundFunction) and this is ancestry[0].body
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
      children.options = options
      children.compile = (node) ->
        walk.call node.g(), fn, inScope, ancestry

      do ancestry.shift
      jsNode = fn.call this, children
      jsNode[p] = @[p] for p in ['raw', 'line', 'column', 'offset']
      jsNode

    generateSymbols = do ->

      generatedSymbols = {}
      format = (pre, counter) ->
        if pre
          "#{pre}$#{counter or ''}"
        else
          if counter < 26
            String.fromCharCode 0x61 + counter
          else
            [div, mod] = divMod counter, 26
            (format pre, div - 1) + format pre, mod

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
      generateMutatingWalker (state) ->
        state.declaredSymbols = union state.declaredSymbols, map (declarationsNeeded this), (id) -> id.name
        {declaredSymbols, usedSymbols, nsCounters} = state
        newNode = if @instanceof JS.GenSym
          newNode = new JS.Identifier generateName this, state
          usedSymbols.push newNode.name
          newNode
        else if @instanceof JS.FunctionExpression, JS.FunctionDeclaration
          params = concatMap @params, collectIdentifiers
          nsCounters_ = {}
          nsCounters_[k] = v for own k, v of nsCounters
          newNode = generateSymbols this,
            declaredSymbols: union declaredSymbols, params
            usedSymbols: union usedSymbols, params
            nsCounters: nsCounters_
          newNode.body = forceBlock newNode.body
          declNames = nub difference (map (declarationsNeededRecursive @body), (id) -> id.name), union declaredSymbols, params
          decls = map declNames, (name) -> new JS.Identifier name
          newNode.body.body.unshift makeVarDeclaration decls if decls.length > 0
          newNode
        else generateSymbols this, state
        state.declaredSymbols = union declaredSymbols, map (declarationsNeededRecursive newNode), (id) -> id.name
        newNode

    defaultRule = ->
      throw new Error "compile: Non-exhaustive patterns in case: #{@className}"

    (ast, options = {}) ->
      options.bare ?= no
      rules = @rules
      jsAST = walk.call ast, (-> (rules[@className] ? defaultRule).apply this, arguments), [], [], options
      generateSymbols jsAST,
        declaredSymbols: []
        usedSymbols: union jsReserved[..], collectIdentifiers jsAST
        nsCounters: {}
