{find, any, all, concat, concatMap, difference, divMod, foldl, foldl1, intersect, map, nub, owns, partition, span, union, zip} = require './functional-helpers'
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

# mapper has type (node, nameInParent) -> A
# reducer has type (B, A) -> B
# identity has type B
# opts contains optional overrides:
#   listReducer
#   listIdentity
#
# Runs the mapper over every child node, then folds them together with
# the reducer & identity.
#
# listReducer and listIdentity are optional and let you use a different
# reducing function for siblings in the same child listMember than you
# use between disparate children.
#
mapChildNodes = (node, mapper, reducer, identity, opts={}) ->
  opts.listReducer ?= reducer
  opts.listIdentity ?= identity
  foldl identity, (for childName in node.childNodes when node[childName]?
    if childName in node.listMembers
      foldl opts.listIdentity, (mapper(child, childName) for child in node[childName] when child?), opts.listReducer
    else
      mapper(node[childName], childName)
  ), reducer

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
    new JS.CallExpression (funcExpr body: (forceBlock s)), []
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
    iife = funcExpr params: [accum], body: block
    new JS.CallExpression (memberAccess iife.g(), 'call'), [new JS.ThisExpression, new JS.ArrayExpression []]
  else if s.instanceof JS.SwitchStatement, JS.TryStatement
    block = new JS.BlockStatement [makeReturn s]
    iife = funcExpr body: block
    new JS.CallExpression (memberAccess iife.g(), 'call'), [new JS.ThisExpression]
  else
    # TODO: comprehensive
    throw new Error "expr: Cannot use a #{s.type} as a value"

isScopeBoundary = (node) ->
  (node.instanceof JS.FunctionExpression, JS.FunctionDeclaration) and not node.generated

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
  # These are CoffeeScript statements. They can't be used in expression position and they don't trigger auto-return behaviour in functions.
  else if node.instanceof JS.ThrowStatement, JS.ReturnStatement, JS.BreakStatement, JS.ContinueStatement, JS.DebuggerStatement then node
  else if (node.instanceof JS.UnaryExpression) and node.operator is 'void' then new JS.ReturnStatement
  else new JS.ReturnStatement expr node


generateMutatingWalker = (fn) -> (node, args...) ->
  mapper = (child, nameInParent) -> [nameInParent, fn.apply(child, args)]
  reducer = (parent, [name, newChild]) -> parent[name] = newChild; parent
  mapChildNodes node, mapper, reducer, node, {
    listReducer: ([_, accum],[name, newChild]) -> [name, accum.concat(newChild) ]
    listIdentity: [null, []]
  }



declaredIdentifiers = (node) ->
  return [] unless node?
  if node.instanceof JS.Identifier
    [node.name]
  else if node.instanceof JS.MemberExpression
    []
  else
    concatMap node.childNodes, (childName) ->
      return [] unless node[childName]?
      if childName in node.listMembers
        concatMap node[childName], declaredIdentifiers
      else
        declaredIdentifiers node[childName]

declarationsNeeded = (node) ->
  return [] unless node?
  if ((node.instanceof JS.AssignmentExpression) and node.operator is '=') or (node.instanceof JS.ForInStatement)
    declaredIdentifiers(node.left)
  else
    []

declarationsNeededRecursive = (node) ->
  return [] unless node?
  if isScopeBoundary(node) then []
  else union (declarationsNeeded node), mapChildNodes(node, declarationsNeededRecursive, ((a,b)->a.concat(b)), [])

variableDeclarations = (node) ->
  return [] unless node?
  if node.instanceof JS.FunctionDeclaration then [node.id]
  else if isScopeBoundary(node) then []
  else if node.instanceof JS.VariableDeclarator then [node.id]
  else mapChildNodes(node, variableDeclarations, ((a,b)->a.concat(b)), [])

collectIdentifiers = (node) -> nub switch
  when !node? then []
  when node.instanceof JS.Identifier then [node.name]
  when (node.instanceof JS.MemberExpression) and not node.computed
    collectIdentifiers node.object
  else mapChildNodes node, collectIdentifiers, ((a,b)->a.concat(b)), []

# TODO: something like Optimiser.mayHaveSideEffects
needsCaching = (node) ->
  return no unless node?
  (envEnrichments node, []).length > 0 or
  (node.instanceof CS.FunctionApplications, CS.DoOp, CS.NewOp, CS.ArrayInitialiser, CS.ObjectInitialiser, CS.RegExp, CS.HeregExp, CS.PreIncrementOp, CS.PostIncrementOp, CS.PreDecrementOp, CS.PostDecrementOp, CS.Range) or
  mapChildNodes node, needsCaching, ((a,b) -> a or b), false

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

# tests for the ES3 equivalent of ES5's IdentifierName
isIdentifierName = (name) ->
  # this regex can be made more permissive, allowing non-whitespace unicode characters
  name not in jsReserved and /^[$_a-z][$_a-z0-9]*$/i.test name

memberAccess = (e, member) ->
  if isIdentifierName member
  then new JS.MemberExpression no, (expr e), new JS.Identifier member
  else new JS.MemberExpression yes, (expr e), new JS.Literal member

dynamicMemberAccess = (e, index) ->
  if (index.instanceof JS.Literal) and typeof index.value is 'string'
  then memberAccess e, index.value
  else new JS.MemberExpression yes, (expr e), expr index

es6AssignmentPattern = (assignee) ->
  if assignee instanceof JS.ArrayExpression
    elements = assignee.elements.map (elt) ->
      if elt instanceof JS.Identifier
        elt
      else if elt.rest
        new JS.RestElement elt.expression
      else
        es6AssignmentPattern(elt)
    if all(elements, (elt) -> elt?)
      new JS.ArrayPattern(elements)

# TODO: rewrite this whole thing using the CS AST nodes
assignment = (assignee, expression, options, valueUsed = no) ->
  assignments = []
  expression = expr expression
  switch
    when assignee.rest then # do nothing for right now

    when options.targetES6 and (es6Pattern = es6AssignmentPattern(assignee))
      assignments.push new JS.AssignmentExpression '=', es6Pattern, expression

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
        assignments.push assignment m, (dynamicMemberAccess e, new JS.Literal i), options, valueUsed

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
        assignments.push assignment m.value, (dynamicMemberAccess e, propName), options, valueUsed

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
      new JS.ForInStatement (new JS.VariableDeclaration 'var', [new JS.VariableDeclarator key, null]), parent, new JS.IfStatement (helpers.isOwn parent, key), f = # TODO: figure out how we can allow this
        stmt new JS.AssignmentExpression '=', (new JS.MemberExpression yes, child, key), new JS.MemberExpression yes, parent, key
      funcDecl(id: ctor , body: new JS.BlockStatement [
        stmt new JS.AssignmentExpression '=', (memberAccess new JS.ThisExpression, 'constructor'), child
      ])
      new JS.AssignmentExpression '=', (protoAccess ctor), protoAccess parent
      new JS.AssignmentExpression '=', (protoAccess child), new JS.NewExpression ctor, []
      new JS.AssignmentExpression '=', (memberAccess child, '__super__'), protoAccess parent
      new JS.ReturnStatement child
    ]
    funcDecl(id: helperNames.extends, params: [child, parent], body: (new JS.BlockStatement map block, stmt))
  construct: ->
    child = new JS.Identifier 'child'
    ctor = new JS.Identifier 'ctor'
    fn = new JS.Identifier 'fn'
    args = new JS.Identifier 'args'
    result = new JS.Identifier 'result'
    block = [
      new JS.VariableDeclaration 'var', [
        new JS.VariableDeclarator fn, (funcExpr body: (new JS.BlockStatement []))
      ]
      new JS.AssignmentExpression '=', (memberAccess fn, 'prototype'), memberAccess ctor, 'prototype'
      new JS.VariableDeclaration 'var', [
        new JS.VariableDeclarator child, new JS.NewExpression fn, []
        new JS.VariableDeclarator result, new JS.CallExpression (memberAccess ctor, 'apply'), [child, args]
      ]
      new JS.ReturnStatement new JS.ConditionalExpression (new JS.BinaryExpression '===', result, new JS.CallExpression (new JS.Identifier 'Object'), [result]), result, child
    ]
    funcDecl(id: helperNames.construct, params: [ctor, args], body: (new JS.BlockStatement map block, stmt))
  isOwn: ->
    hop = memberAccess (new JS.ObjectExpression []), 'hasOwnProperty'
    params = args = [(new JS.Identifier 'o'), new JS.Identifier 'p']
    functionBody = [new JS.CallExpression (memberAccess hop, 'call'), args]
    funcDecl(id: helperNames.isOwn, params: params, body: (makeReturn new JS.BlockStatement map functionBody, stmt))
  in: ->
    member = new JS.Identifier 'member'
    list = new JS.Identifier 'list'
    i = new JS.Identifier 'i'
    length = new JS.Identifier 'length'
    varDeclaration = new JS.VariableDeclaration 'var', [
      new JS.VariableDeclarator i, new JS.Literal 0
      new JS.VariableDeclarator length, memberAccess list, 'length'
    ]
    loopBody = new JS.IfStatement (new JS.LogicalExpression '&&', (new JS.BinaryExpression 'in', i, list), (new JS.BinaryExpression '===', (new JS.MemberExpression yes, list, i), member)), new JS.ReturnStatement new JS.Literal yes
    functionBody = [
      new JS.ForStatement varDeclaration, (new JS.BinaryExpression '<', i, length), (new JS.UpdateExpression '++', yes, i), loopBody
      new JS.Literal no
    ]
    funcDecl(id: helperNames.in, params: [member, list], body: (makeReturn new JS.BlockStatement map functionBody, stmt))

enabledHelpers = []
for own h, fn of helpers
  helperNames[h] = genSym h
  helpers[h] = do (h, fn) -> ->
    enabledHelpers.push fn()
    (helpers[h] = -> new JS.CallExpression helperNames[h], arguments).apply this, arguments

inlineHelpers =
  exp: -> new JS.CallExpression (memberAccess (new JS.Identifier 'Math'), 'pow'), arguments
  undef: -> new JS.UnaryExpression 'void', new JS.Literal 0
  slice: -> new JS.CallExpression (memberAccess (memberAccess (new JS.ArrayExpression []), 'slice'), 'call'), arguments

for own h, fn of inlineHelpers
  helpers[h] = fn

findES6Methods = (classIdentifier, body) ->
  methods = []
  properties = []
  rest = []
  for statement in body.body
    expression = statement.expression
    if (expression instanceof JS.AssignmentExpression) and (expression.operator == '=') and (expression.left instanceof JS.MemberExpression)
      if (expression.left.object instanceof JS.MemberExpression) and (expression.left.object.property.name == 'prototype')
        if expression.right instanceof JS.FunctionExpression
          methods.push(new JS.MethodDefinition(new JS.Identifier(expression.left.property.name), expression.right))
        else
          properties.push new JS.AssignmentExpression('=', new JS.MemberExpression(false, new JS.MemberExpression(false, classIdentifier, new JS.Identifier('prototype')), expression.left.property), expression.right)
      else if expression.left.object instanceof JS.ThisExpression
        properties.push new JS.AssignmentExpression('=', new JS.MemberExpression(false, classIdentifier, expression.left.property), expression.right)
    else
      rest.push(statement)
  { methods, properties, rest }

funcExpr = ({id, params, defaults, rest, body}) ->
  new JS.FunctionExpression(id ? null, params ? [], defaults ? [], rest ? null, body)

funcDecl = ({id, params, defaults, rest, body}) ->
  new JS.FunctionDeclaration(id ? null, params ? [], defaults ? [], rest ? null, body)

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

      # Push function declaration helpers, unshift all other types (VariableDeclarations, etc.)
      [fnDeclHelpers, otherHelpers] = partition enabledHelpers, (helper) -> helper.instanceof JS.FunctionDeclaration
      [].push.apply block, fnDeclHelpers
      [].unshift.apply block, otherHelpers

      decls = nub concatMap block, declarationsNeededRecursive
      if decls.length and not options.bare
        # add a function wrapper
        block = [stmt new JS.UnaryExpression 'void', new JS.CallExpression (memberAccess (funcExpr body: new JS.BlockStatement(block)), 'call'), [new JS.ThisExpression]]
      # generate node
      pkg = require './../package.json'
      program = new JS.Program block
      ecmaMode = if options.targetES6 then '-es6' else ''
      program.leadingComments = [
        type: 'Line'
        value: " Generated by CoffeeScript #{pkg.version}#{ecmaMode}"
      ]
      program
    ]
    [CS.Block, ({statements}) ->
      switch statements.length
        when 0 then new JS.EmptyStatement
        when 1 then new stmt statements[0]
        else new JS.BlockStatement concatMap statements, (s) ->
          if s.instanceof JS.BlockStatement then map s.body, stmt
          else if s.instanceof JS.SequenceExpression then map s.expressions, stmt
          else [stmt s]
    ]
    [CS.SeqOp, ({left, right}) -> new JS.SequenceExpression [left, right]]
    [CS.Conditional, ({condition, consequent, alternate, ancestry}) ->
      if alternate?
        throw new Error 'Conditional with non-null alternate requires non-null consequent' unless consequent?
        alternate = forceBlock alternate unless alternate.instanceof JS.IfStatement
      if alternate? or ancestry[0]?.instanceof CS.Conditional
        consequent = forceBlock consequent
      new JS.IfStatement (expr condition), (forceBlock consequent), alternate
    ]
    [CS.ForIn, ({valAssignee, keyAssignee, target, step, filter, body, compile, options}) ->
      i = genSym 'i'
      length = genSym 'length'
      block = forceBlock body
      block.body.push stmt helpers.undef() unless block.body.length

      increment =
        if @step? and not ((@step.instanceof CS.Int) and @step.data is 1)
          (x) -> new JS.AssignmentExpression '+=', x, step
        else
          (x) -> new JS.UpdateExpression '++', yes, x

      # optimise loops over static, integral ranges
      if (@target.instanceof CS.Range) and
      # TODO: extract this test to some "static, integral range" helper
      ((@target.left.instanceof CS.Int) or ((@target.left.instanceof CS.UnaryNegateOp) and @target.left.expression.instanceof CS.Int)) and
      ((@target.right.instanceof CS.Int) or ((@target.right.instanceof CS.UnaryNegateOp) and @target.right.expression.instanceof CS.Int))
        varDeclaration = new JS.VariableDeclaration 'var', [new JS.VariableDeclarator i, compile @target.left]
        update = increment i
        if @filter?
          block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', filter), new JS.ContinueStatement
        if keyAssignee?
          k = genSym 'k'
          varDeclaration.declarations.unshift new JS.VariableDeclarator k, new JS.Literal 0
          update = new JS.SequenceExpression [(increment k), update]
          block.body.unshift stmt new JS.AssignmentExpression '=', keyAssignee, k
        if valAssignee?
          block.body.unshift stmt new JS.AssignmentExpression '=', valAssignee, i
        op = if @target.isInclusive then '<=' else '<'
        return new JS.ForStatement varDeclaration, (new JS.BinaryExpression op, i, compile @target.right), update, block

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
        block.body.unshift stmt assignment keyAssignee, i, options
      if valAssignee?
        block.body.unshift stmt assignment valAssignee, (new JS.MemberExpression yes, e, i), options
      new JS.ForStatement varDeclaration, (new JS.BinaryExpression '<', i, length), (increment i), block
    ]
    [CS.ForOf, ({keyAssignee, valAssignee, target, filter, body, options}) ->
      block = forceBlock body
      block.body.push stmt helpers.undef() unless block.body.length
      e = if @isOwn and needsCaching @target then genSym 'cache' else expr target
      if @filter?
        # TODO: if block only has a single statement, wrap it instead of continuing
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', filter), new JS.ContinueStatement
      if valAssignee?
        block.body.unshift stmt assignment valAssignee, (new JS.MemberExpression yes, e, keyAssignee), options
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
    [CS.Try, ({body, catchAssignee, catchBody, finallyBody, options}) ->
      finallyBlock = if @finallyBody? then forceBlock finallyBody else null
      if @catchBody? or not @finallyBody?
        e = genSym 'e'
        catchBlock = forceBlock catchBody
        if catchAssignee?
          catchBlock.body.unshift stmt assignment catchAssignee, e, options
        handlers = [new JS.CatchClause e, catchBlock]
      else
        handlers = []
      new JS.TryStatement (forceBlock body), handlers, finallyBlock
    ]
    [CS.Throw, ({expression}) -> new JS.ThrowStatement expression]

    # data structures
    [CS.Range, ({left: left_, right: right_, ancestry}) ->
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
      if any ancestry, (ancestor) -> ancestor.instanceof CS.Functions
        new JS.CallExpression (memberAccess (funcExpr body: new JS.BlockStatement body), 'apply'), [new JS.ThisExpression, new JS.Identifier 'arguments']
      else
        new JS.CallExpression (memberAccess (funcExpr body: new JS.BlockStatement body), 'call'), [new JS.ThisExpression]
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
          grouped = map (groupMembers members), expr
          if grouped.length <= 1 then grouped[0]
          else new JS.CallExpression (memberAccess grouped[0], 'concat'), grouped[1..]
        else
          new JS.ArrayExpression map members, expr
    ]
    [CS.Spread, ({expression}) -> {spread: yes, expression: expr expression}]
    [CS.ObjectInitialiser, ({members}) -> new JS.ObjectExpression members]
    [CS.ObjectInitialiserMember, ({key, expression}) ->
      keyName = @key.data
      key = if isIdentifierName keyName then new JS.Identifier keyName else new JS.Literal keyName
      new JS.Property key, expr expression
    ]
    [CS.DefaultParam, ({param, default: d}) -> {param, default: d}]
    [CS.Function, CS.BoundFunction, do ->

      handleParam = (param, original, block, inScope, options) -> switch
        when original.instanceof CS.Rest then param # keep these for special processing later
        when original.instanceof CS.Identifier then param
        when original.instanceof CS.MemberAccessOps, CS.ObjectInitialiser, CS.ArrayInitialiser
          if options.targetES6 and (pattern = es6AssignmentPattern(param))
            pattern
          else
            p = genSym 'param'
            decls = map (intersect inScope, beingDeclared original), (i) -> new JS.Identifier i
            block.body.unshift stmt assignment param, p, options
            block.body.unshift makeVarDeclaration decls if decls.length
            p
        when original.instanceof CS.DefaultParam
          p = handleParam.call this, param.param, original.param, block, inScope, options
          if !options.targetES6
            block.body.unshift new JS.IfStatement (new JS.BinaryExpression '==', (new JS.Literal null), p), stmt assignment p, param.default, options
          p
        else throw new Error "Unsupported parameter type: #{original.className}"

      ({parameters, body, ancestry, inScope, options}) ->
        unless ancestry[0]?.instanceof CS.Constructor
          body = makeReturn body
        block = forceBlock body
        last = block.body[-1..][0]
        if (last?.instanceof JS.ReturnStatement) and not last.argument?
          block.body = block.body[...-1]

        defaults = if options.targetES6
          zip(parameters, @parameters).map ([param, original]) ->
            if original instanceof CS.DefaultParam
              param.default
            else
              null
        else
          []

        parameters_ =
          if parameters.length is 0 then []
          else
            pIndex = parameters.length
            while pIndex--
              handleParam.call this, parameters[pIndex], @parameters[pIndex], block, inScope, options
        parameters = parameters_.reverse()

        if parameters.length > 0
          if parameters[-1..][0].rest
            if options.targetES6
              rest = new JS.Identifier(parameters.pop().expression.name)
            else
              paramName = parameters.pop().expression
              numParams = parameters.length
              test = new JS.BinaryExpression '>', (memberAccess (new JS.Identifier 'arguments'), 'length'), new JS.Literal numParams
              consequent = helpers.slice (new JS.Identifier 'arguments'), new JS.Literal numParams
              alternate = new JS.ArrayExpression []
              if (paramName.instanceof JS.Identifier) and paramName.name in inScope
                block.body.unshift makeVarDeclaration [paramName]
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
            if (paramName.instanceof JS.Identifier) and paramName.name in inScope
              block.body.unshift makeVarDeclaration [paramName]
            block.body.unshift reassignments
          if any parameters, (p) -> p.rest
            throw new Error 'Parameter lists may not have more than one rest operator'

        performedRewrite = no
        if @instanceof CS.BoundFunction
          if options.targetES6
            if block.body.length == 1 && block.body[0] instanceof JS.ReturnStatement
              fn = new JS.ArrowFunctionExpression parameters, defaults, rest, block.body[0].argument
              fn.expression = true
              return fn
            else
              return new JS.ArrowFunctionExpression parameters, defaults, rest, block
          else
            newThis = genSym 'this'
            rewriteThis = generateMutatingWalker ->
              if @instanceof JS.ThisExpression
                performedRewrite = yes
                newThis
              else if @instanceof JS.FunctionExpression, JS.FunctionDeclaration then this
              else rewriteThis this
            rewriteThis block

        fn = funcExpr params:parameters, defaults:defaults, rest: rest, body: block
        if performedRewrite
          new JS.CallExpression (funcExpr params: [newThis], body: new JS.BlockStatement [
            new JS.ReturnStatement fn
          ]), [new JS.ThisExpression]
        else fn
    ]
    [CS.Rest, ({expression, options}) -> {rest: yes, expression, isExpression: yes, isStatement: yes}]

    # TODO: comment
    [CS.Class, ({nameAssignee, parent, name, ctor, body, compile, options}) ->
      if options.targetES6
        classIdentifier = new JS.Identifier(name.name)
        if parent
          parentIdentifier = new JS.Identifier(parent.name)
        { methods, properties, classProperties, rest } = findES6Methods(classIdentifier, forceBlock body)
        if ctor
          for c, i in rest when c.instanceof JS.FunctionDeclaration
            ctorIndex = i
            break
          rest.splice(ctorIndex, 1)
          methods.unshift new JS.MethodDefinition(new JS.Identifier('constructor'), funcExpr(id: ctor.id, params: ctor.params, body: ctor.body, defaults: ctor.defaults, rest: ctor.rest))
        # Emit our ES6 class if we were able to account for everything in its definition. Otherwise, fall through to the non-ES6 emulation
        if rest.length == 0
          return new JS.SequenceExpression([new JS.ClassDeclaration(classIdentifier, parentIdentifier, new JS.ClassBody(methods))].concat(properties))

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
        ctorBody = new JS.BlockStatement []
        if parent?
          ctorBody.body.push stmt new JS.CallExpression (memberAccess parentRef, 'apply'), [
            new JS.ThisExpression, new JS.Identifier 'arguments'
          ]
        ctor = funcDecl id: name, body: ctorBody
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
          fn = funcExpr params: ps, body: new JS.BlockStatement [
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

      iife = new JS.CallExpression (funcExpr params: params, body: block).g(), args
      if nameAssignee? then assignment nameAssignee, iife, options else iife
    ]
    [CS.Constructor, ({expression}) ->
      tmpName = genSym 'class'
      debugger
      if @expression.instanceof CS.Functions
        funcDecl id: tmpName, params: expression.params, defaults: expression.defaults, rest: expression.rest, body: (forceBlock expression.body)
      else
        funcDecl id: tmpName, body: (new JS.BlockStatement [])
    ]
    [CS.ClassProtoAssignOp, ({assignee, expression, compile}) ->
      if @expression.instanceof CS.BoundFunction
        compile new CS.ClassProtoAssignOp @assignee, new CS.Function @expression.parameters, @expression.body
      else
        protoMember = memberAccess (memberAccess new JS.ThisExpression, 'prototype'), @assignee.data
        new JS.AssignmentExpression '=', protoMember, expression
    ]

    # more complex operations
    [CS.AssignOp, ({assignee, expression, ancestry, options}) ->
      assignment assignee, expression, options, usedAsExpression this, ancestry
    ]
    [CS.CompoundAssignOp, ({assignee, expression, inScope}) ->
      op = switch @op
        when CS.LogicalAndOp::className         then '&&'
        when CS.LogicalOrOp::className          then '||'
        when CS.ExistsOp::className             then '?'
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

      # if assignee is an identifier, fail unless assignee is in scope
      if op in ['&&', '||', '?'] and (assignee.instanceof JS.Identifier) and assignee.name not in inScope
        throw new Error "the variable \"#{assignee.name}\" can't be assigned with ?= because it has not been defined."

      switch op
        when '&&', '||'
          new JS.LogicalExpression op, assignee, new JS.AssignmentExpression '=', assignee, expr expression
        when '?'
          condition = new JS.BinaryExpression '!=', (new JS.Literal null), assignee
          new JS.ConditionalExpression condition, assignee, new JS.AssignmentExpression '=', assignee, expr expression
        when '**'
          new JS.AssignmentExpression '=', assignee, helpers.exp assignee, expr expression
        else new JS.AssignmentExpression "#{op}=", assignee, expr expression
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
      new JS.LogicalExpression '&&', lhs, new JS.BinaryExpression expression.operator, left, expression.right
    ]

    [CS.Super, ({arguments: args, compile, inScope, ancestry, options}) ->
      classNode = find ancestry, (node) =>
        (node instanceof CS.Class) or (node.assignee instanceof CS.ProtoMemberAccessOp)

      classPositionInAncestry = ancestry.indexOf(classNode)
      classAssignNode = ancestry[ ancestry.indexOf(classNode) - 1]

      className = null
      functionName = null
      isStatic = false
      isProtoMemberAccess = classNode.assignee instanceof CS.ProtoMemberAccessOp

      switch
        when classNode instanceof CS.Class
          className = classNode.name.data
          functionName = do ->
            searchableNodes = [];
            for i, n in ancestry
              break if n is classPositionInAncestry
              searchableNodes.unshift i
            assignableNode = find searchableNodes, (node) => node.assignee?
            return 'constructor' unless assignableNode?

            switch
              when assignableNode.assignee instanceof CS.MemberAccessOp
                isStatic = true
                assignableNode.assignee.memberName
              when assignableNode.assignee instanceof CS.Identifier
                assignableNode.assignee.data

        when classNode instanceof CS.AssignOp
          isStatic = false
          className = classNode.assignee.expression.data
          functionName = classNode.assignee.memberName

      if options.targetES6
        if functionName == 'constructor'
          return new JS.CallExpression new JS.Identifier('super'), (map args, expr)
        else
          return new JS.CallExpression (memberAccess new JS.Identifier('super'), functionName), (map args, expr)

      if className is 'class'
        if args.length > 0
          calledExprs = [new JS.ThisExpression].concat (map args, expr)
          return new JS.CallExpression (memberAccess (memberAccess (memberAccess (new JS.Identifier classNode.parent.data) , 'prototype'), functionName), 'call'), calledExprs
        else
          return new JS.CallExpression (memberAccess (memberAccess (memberAccess (new JS.Identifier classNode.parent.data) , 'prototype'), functionName), 'apply'), [
            new JS.ThisExpression
            new JS.Identifier 'arguments'
          ]

      if isStatic
        if args.length is 0
          new JS.CallExpression (memberAccess (memberAccess (memberAccess (memberAccess (new JS.Identifier className) , '__super__'), 'constructor'),  functionName), 'apply'), [
            new JS.ThisExpression
            new JS.Identifier 'arguments'
          ]
        else
          calledExprs = [new JS.ThisExpression].concat (map args, expr)
          new JS.CallExpression (memberAccess (memberAccess (memberAccess (memberAccess (new JS.Identifier className) , '__super__'), 'constructor'), functionName), 'call'), calledExprs
      else
        if args.length is 0
          new JS.CallExpression (memberAccess (memberAccess (memberAccess (new JS.Identifier className) , '__super__'), functionName), 'apply'), [
            new JS.ThisExpression
            new JS.Identifier 'arguments'
          ]
        else
          calledExprs = [new JS.ThisExpression].concat (map args, expr)
          new JS.CallExpression (memberAccess (memberAccess (memberAccess (new JS.Identifier className) , '__super__'), functionName), 'call'), calledExprs
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
      else
        access = memberAccess expression, @memberName
        # manually calculate raw/position info for member name
        if @raw and @expression.raw
          access.property.raw = @memberName
          access.property.line = @line
          offset = @raw.length - @memberName.length
          access.property.column = @column + offset - 1
          access.property.offset = @offset + offset - 1
          @column += @expression.raw.length
          @offset += @expression.raw.length
        access
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
          else new JS.LogicalExpression '||', (new JS.BinaryExpression '+', (new JS.UnaryExpression '+', right), new JS.Literal 1), new JS.Literal 9e9
        else right
      new JS.CallExpression (memberAccess expression, 'slice'), args
    ]
    [CS.ExistsOp, ({left, right, ancestry, inScope}) ->
      left = expr left
      right = expr right
      e = if needsCaching @left then genSym 'cache' else left
      condition = new JS.BinaryExpression '!=', (new JS.Literal null), e
      if (e.instanceof JS.Identifier) and e.name not in inScope
        condition = new JS.LogicalExpression '&&', (new JS.BinaryExpression '!==', (new JS.Literal 'undefined'), new JS.UnaryExpression 'typeof', e), condition
      node = new JS.ConditionalExpression condition, e, right
      if e is left then node
      else new JS.SequenceExpression [(new JS.AssignmentExpression '=', e, left), node]
    ]
    [CS.UnaryExistsOp, ({expression, inScope}) ->
      nullTest = new JS.BinaryExpression '!=', (new JS.Literal null), expression
      if (expression.instanceof JS.Identifier) and expression.name not in inScope
        typeofTest = new JS.BinaryExpression '!==', (new JS.Literal 'undefined'), new JS.UnaryExpression 'typeof', expression
        new JS.LogicalExpression '&&', typeofTest, nullTest
      else nullTest
    ]
    [CS.DoOp, do ->
      deriveArgsFromParams = (params) ->
        args = for param, index in params
          switch
            when param.instanceof CS.DefaultParam
              params[index] = param.param
              param.default
            when param.instanceof CS.Identifier, CS.MemberAccessOp then param
            else helpers.undef()
      ({expression, compile}) ->
        args = []
        if (@expression.instanceof CS.AssignOp) and @expression.expression.instanceof CS.Functions
          args = deriveArgsFromParams @expression.expression.parameters
        else if @expression.instanceof CS.Functions
          args = deriveArgsFromParams @expression.parameters
        compile new CS.FunctionApplication @expression, args
    ]
    [CS.Return, ({expression: e}) -> new JS.ReturnStatement expr e]
    [CS.Break, -> new JS.BreakStatement]
    [CS.Continue, -> new JS.ContinueStatement]
    [CS.Debugger, -> new JS.DebuggerStatement]

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
              foldl1 comparisons, (l, r) -> new JS.LogicalExpression '||', l, r
      else
        helpers.in (expr left), expr right
    ]
    [CS.ExtendsOp, ({left, right}) -> helpers.extends (expr left), expr right]
    [CS.InstanceofOp, ({left, right}) -> new JS.BinaryExpression 'instanceof', (expr left), expr right]

    [CS.LogicalAndOp, ({left, right}) -> new JS.LogicalExpression '&&', (expr left), expr right]
    [CS.LogicalOrOp, ({left, right}) -> new JS.LogicalExpression '||', (expr left), expr right]

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

      for childName in @childNodes when this[childName]?
        children[childName] =
          if childName in @listMembers
            for member in this[childName]
              jsNode = walk.call member, fn, inScope, ancestry, options
              inScope = union inScope, envEnrichments member, inScope
              jsNode
          else
            child = this[childName]
            jsNode = walk.call child, fn, inScope, ancestry, options
            inScope = union inScope, envEnrichments child, inScope
            jsNode

      children.inScope = inScope
      children.ancestry = ancestry
      children.options = options
      children.compile = (node) ->
        walk.call node, fn, inScope, ancestry, options

      do ancestry.shift
      jsNode = fn.call this, children
      jsNode.raw = @raw
      jsNode.line = @line
      jsNode.column = @column - 1 # Spidermonkey AST columns are 0-based
      jsNode.offset = @offset
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
      generateChildSymbols = generateMutatingWalker (state) ->
        state.declaredSymbols = union state.declaredSymbols, declarationsNeeded this
        {declaredSymbols, usedSymbols, nsCounters} = state
        newNode = if @instanceof JS.GenSym
          newNode = new JS.Identifier generateName this, state
          usedSymbols.push newNode.name
          newNode
        else if isScopeBoundary(this)
          params = concatMap @params, collectIdentifiers
          nsCounters_ = {}
          nsCounters_[k] = v for own k, v of nsCounters
          newNode = generateChildSymbols this,
            declaredSymbols: union declaredSymbols, params
            usedSymbols: union usedSymbols, params
            nsCounters: nsCounters_
          newNode.body = forceBlock newNode.body
          undeclared = declarationsNeededRecursive @body
          undeclared = difference undeclared, map (variableDeclarations @body), (id) -> id.name
          alreadyDeclared = union declaredSymbols, concatMap @params, collectIdentifiers
          declNames = nub difference undeclared, alreadyDeclared
          decls = map declNames, (name) -> new JS.Identifier name
          newNode.body.body.unshift makeVarDeclaration decls if decls.length > 0
          newNode
        else generateChildSymbols this, state
        state.declaredSymbols = union declaredSymbols, declarationsNeededRecursive newNode
        newNode

      (jsAST, state) ->
        inScope = (state.declaredSymbols ? []).slice()
        program = generateChildSymbols(jsAST, state)
        if program.instanceof JS.Program
          needed = nub difference (concatMap program.body, declarationsNeededRecursive), inScope
          if needed.length > 0
            program.body.unshift makeVarDeclaration needed.map((n) -> new JS.Identifier(n))
        program

    defaultRule = ->
      throw new Error "compile: Non-exhaustive patterns in case: #{@className}"

    (ast, options = {}) ->
      options.bare ?= no
      rules = @rules
      inScope = options.inScope ? []
      jsAST = walk.call ast, (-> (rules[@className] ? defaultRule).apply this, arguments), inScope, [], options
      generateSymbols jsAST,
        declaredSymbols: inScope
        usedSymbols: union jsReserved[..], collectIdentifiers jsAST
        nsCounters: {}

