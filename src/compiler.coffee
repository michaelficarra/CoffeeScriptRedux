{any, concat, concatMap, difference, divMod, foldl1, map, nub, owns, union} = require './functional-helpers'
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
  #else if (e.instanceof JS.BinaryExpression) and e.operator is '&&'
  #  new JS.IfStatement (expr e.left), stmt e.right
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
  else if s.instanceof JS.BreakStatement, JS.ContinueStatement, JS.ReturnStatement
    # TODO: better error
    throw new Error "pure statement in an expression"
  else if s.instanceof JS.ExpressionStatement
    s.expression
  else if s.instanceof JS.IfStatement
    consequent = expr (s.consequent ? helpers.undef())
    alternate = expr (s.alternate ? helpers.undef())
    new JS.ConditionalExpression s.test, consequent, alternate
  else if s.instanceof JS.ForInStatement, JS.ForStatement, JS.WhileStatement
    accum = genSym 'accum'
    # TODO: remove accidental mutation like this in these helpers
    s.body = forceBlock s.body
    push = memberAccess accum, 'push'
    s.body.body[s.body.body.length - 1] = stmt new JS.CallExpression push, [expr s.body.body[-1..][0]]
    block = new JS.BlockStatement [s, new JS.ReturnStatement accum]
    iife = new JS.FunctionExpression null, [accum], block
    new JS.CallExpression (memberAccess iife, 'call'), [new JS.ThisExpression, new JS.ArrayExpression []]
  else if s.instanceof JS.SwitchStatement
    block = new JS.BlockStatement [makeReturn s]
    iife = new JS.FunctionExpression null, [], block
    new JS.CallExpression (memberAccess iife, 'call'), [new JS.ThisExpression]
  else
    # TODO: comprehensive
    throw new Error "expr: #{s.type}"

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
  (envEnrichments node, []).length > 0 or
  (node.instanceof CS.FunctionApplications, CS.DoOp, CS.NewOp, CS.ArrayInitialiser, CS.ObjectInitialiser, CS.RegExp, CS.HeregExp) or
  (any (difference node.childNodes, node.listMembers), (n) -> needsCaching node[n]) or
  (any node.listMembers, (n) -> any node[n], needsCaching)

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
  if member in jsReserved or +member.toString()[0] in [0..9]
  then new JS.MemberExpression yes, (expr e), new JS.Literal member
  else new JS.MemberExpression no, (expr e), new JS.Identifier member

dynamicMemberAccess = (e, index) ->
  if (index.instanceof JS.Literal) and typeof index.value is 'string'
  then memberAccess e, index.value
  else new JS.MemberExpression yes, e, index


helperNames = {}
helpers =
  extends: ->
    protoAccess = (e) -> memberAccess e, 'prototype'
    child = new JS.Identifier 'child'
    parent = new JS.Identifier 'parent'
    ctor = new JS.Identifier 'ctor'
    key = new JS.Identifier 'key'
    block = [
      new JS.ForInStatement key, parent, new JS.IfStatement (helpers.isOwn parent, key),
        stmt new JS.AssignmentExpression '=', (new JS.MemberExpression yes, child, key), new JS.MemberExpression yes, parent, key
      new JS.FunctionDeclaration ctor, [], new JS.BlockStatement [
        stmt new JS.AssignmentExpression '=', (memberAccess new JS.ThisExpression, 'constructor'), child
      ]
      new JS.AssignmentExpression '=', (protoAccess ctor), protoAccess parent
      new JS.AssignmentExpression '=', (protoAccess child), new JS.NewExpression ctor, []
      new JS.AssignmentExpression '=', (memberAccess child, '__super__'), protoAccess parent
      makeReturn child
    ]
    new JS.FunctionDeclaration helperNames.extends, [child, parent], new JS.BlockStatement map block, stmt
  isOwn: ->
    hop = memberAccess (new JS.ObjectExpression []), 'hasOwnProperty'
    params = args = [(new JS.Identifier 'o'), new JS.Identifier 'p']
    functionBody = [new JS.CallExpression (memberAccess hop, 'call'), args]
    new JS.FunctionDeclaration helperNames.isOwn, params, makeReturn new JS.BlockStatement map functionBody, stmt
  in: ->
    member = new JS.Identifier 'member'
    list = new JS.Identifier 'list'
    i = genSym 'i'
    length = genSym 'length'
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
      decls = nub concatMap block, declarationsNeededFor
      if decls.length > 0
        if options.bare
          block.unshift makeVarDeclaration decls
        else
          # add a function wrapper
          block = [stmt new JS.UnaryExpression 'void', new JS.CallExpression (memberAccess (new JS.FunctionExpression null, [], new JS.BlockStatement block), 'call'), [new JS.ThisExpression]]
      # generate node
      program = new JS.Program block
      program.leadingComments = [
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
    [CS.Conditional, ({condition, block, elseBlock, ancestry}) ->
      if elseBlock?
        throw new Error 'Conditional with non-null elseBlock requires non-null block' unless block?
        elseBlock = forceBlock elseBlock unless elseBlock.instanceof JS.IfStatement
      if elseBlock? or ancestry[0]?.instanceof CS.Conditional
        block = forceBlock block
      new JS.IfStatement (expr condition), (stmt block), elseBlock
    ]
    [CS.ForIn, ({valAssignee, keyAssignee, expression, step, filterExpr, block}) ->
      i = genSym 'i'
      length = genSym 'length'
      block = forceBlock block
      e = if needsCaching @expression then genSym 'cache' else expression
      varDeclaration = new JS.VariableDeclaration 'var', [
        new JS.VariableDeclarator i, new JS.Literal 0
        new JS.VariableDeclarator length, memberAccess e, 'length'
      ]
      unless e is expression
        varDeclaration.declarations.unshift new JS.VariableDeclarator e, expression
      if @filterExpr?
        # TODO: if block only has a single statement, wrap it instead of continuing
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', filterExpr), new JS.ContinueStatement
      if keyAssignee?
        block.body.unshift stmt new JS.AssignmentExpression '=', keyAssignee, i
      block.body.unshift stmt new JS.AssignmentExpression '=', valAssignee, new JS.MemberExpression yes, e, i
      new JS.ForStatement varDeclaration, (new JS.BinaryExpression '<', i, length), (new JS.UpdateExpression '++', yes, i), block
    ]
    [CS.ForOf, ({keyAssignee, valAssignee, expression, filterExpr, block}) ->
      block = forceBlock block
      e = if @isOwn and needsCaching @expression then genSym 'cache' else expr expression
      if @filterExpr?
        # TODO: if block only has a single statement, wrap it instead of continuing
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', filterExpr), new JS.ContinueStatement
      if valAssignee?
        block.body.unshift stmt new JS.AssignmentExpression '=', valAssignee, new JS.MemberExpression yes, e, keyAssignee
      if @isOwn
        block.body.unshift stmt new JS.IfStatement (new JS.UnaryExpression '!', helpers.isOwn e, keyAssignee), new JS.ContinueStatement
      right = if e is expression then e else new JS.AssignmentExpression '=', e, expression
      new JS.ForInStatement keyAssignee, right, block
    ]
    [CS.While, ({condition, block}) -> new JS.WhileStatement (expr condition), forceBlock block]
    [CS.Switch, ({expression, cases, elseBlock}) ->
      cases = concat cases
      if elseBlock?
        cases.push new JS.SwitchCase null, [stmt elseBlock]
      for c in cases[...-1] when c.consequent.length > 0
        c.consequent.push new JS.BreakStatement
      new JS.SwitchStatement expression, cases
    ]
    [CS.SwitchCase, ({conditions, block}) ->
      cases = map conditions, (c) ->
        new JS.SwitchCase c, []
      block = stmt block
      block = if block.instanceof JS.BlockStatement then block.body else [block]
      cases[cases.length - 1].consequent = block
      cases
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
    [CS.ArrayInitialiser, ({members}) -> new JS.ArrayExpression map members, expr]
    [CS.ObjectInitialiser, ({members}) -> new JS.ObjectExpression members]
    [CS.ObjectInitialiserMember, ({key, expression}) -> new JS.Property key, expr expression]
    [CS.Function, ({parameters, block, ancestry}) ->
      unless ancestry[0]?.instanceof CS.Constructor
        block = makeReturn block
      block = forceBlock block
      last = block.body[-1..][0]
      if (last?.instanceof JS.ReturnStatement) and not last.argument?
        block.body = block.body[...-1]
      new JS.FunctionExpression null, parameters, block
    ]
    [CS.BoundFunction, ({parameters, block, ancestry}) ->
      unless ancestry[0]?.instanceof CS.Constructor
        block = makeReturn block
      block = forceBlock block
      last = block.body[-1..][0]
      if (last?.instanceof JS.ReturnStatement) and not last.argument?
        block.body = block.body[...-1]
      newThis = genSym 'this'
      performedRewrite = no
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

    # TODO: comment
    [CS.Class, ({nameAssignee, parent, name, ctor, block, compile}) ->
      args = []
      params = []
      parentRef = genSym 'super'
      block = forceBlock block
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
        block.body.splice ctorIndex, 0, stmt new JS.AssignmentExpression '=', ctorRef, compile @ctor.expression

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
      if nameAssignee? then new JS.AssignmentExpression '=', nameAssignee, iife else iife
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
        compile new CS.ClassProtoAssignOp @assignee, new CS.Function @expression.parameters, @expression.block
      else
        protoMember = memberAccess (memberAccess new JS.ThisExpression, 'prototype'), @assignee.data
        new JS.AssignmentExpression '=', protoMember, expression
    ]

    # more complex operations
    [CS.AssignOp, ({assignee, expression, ancestry, compile}) -> switch
      # TODO: DRY?
      when @assignee.instanceof CS.ArrayInitialiser
        assignments = []
        e = @expression
        valueUsed = usedAsExpression this, ancestry
        if @assignee.members.length > 1 and (needsCaching e) or valueUsed
          e = new CS.GenSym 'cache'
          assignments.push new CS.AssignOp e, @expression
        for m, i in @assignee.members
          assignments.push new CS.AssignOp m, new CS.DynamicMemberAccessOp e, new CS.Int i
        return helpers.undef() unless assignments.length
        assignSeq = foldl1 assignments, (a, b) -> new CS.SeqOp a, b
        compile (if valueUsed then new CS.SeqOp assignSeq, e else assignSeq)
      when @assignee.instanceof CS.ObjectInitialiser
        assignments = []
        e = @expression
        valueUsed = usedAsExpression this, ancestry
        if @assignee.members.length > 1 and (needsCaching e) or valueUsed
          e = new CS.GenSym 'cache'
          assignments.push new CS.AssignOp e, @expression
        for m, i in @assignee.members
          assignments.push new CS.AssignOp m.expression, new CS.MemberAccessOp e, m.key.data
        return helpers.undef() unless assignments.length
        assignSeq = foldl1 assignments, (a, b) -> new CS.SeqOp a, b
        compile (if valueUsed then new CS.SeqOp assignSeq, e else assignSeq)
      when @assignee.instanceof CS.Identifier, CS.GenSym, CS.MemberAccessOps
        new JS.AssignmentExpression '=', assignee, expr expression
      else
        throw new Error "compile: AssignOp: unassignable assignee: #{@assignee.className}"
    ]
    [CS.CompoundAssignOp, ({assignee, expression}) ->
      op = switch @op
        when CS.LogicalAndOp         then '&&'
        when CS.LogicalOrOp          then '||'
        when CS.BitOrOp              then '|'
        when CS.BitXorOp             then '^'
        when CS.BitAndOp             then '&'
        when CS.LeftShiftOp          then '<<'
        when CS.SignedRightShiftOp   then '>>'
        when CS.UnsignedRightShiftOp then '>>>'
        when CS.PlusOp               then '+'
        when CS.SubtractOp           then '-'
        when CS.MultiplyOp           then '*'
        when CS.DivideOp             then '/'
        when CS.RemOp                then '%'
        else throw new Error 'Unrecognised compound assignment operator'
      if op in ['&&', '||']
        # TODO: if assignee is an identifier, fail unless assignee is in scope
        new JS.BinaryExpression op, assignee, new JS.AssignmentExpression '=', assignee, expression
      else new JS.AssignmentExpression "#{op}=", assignee, expression
    ]
    [CS.ExistsAssignOp, ({assignee, expression, inScope}) ->
      if (assignee.instanceof JS.Identifier) and assignee.name not in inScope
        throw new Error "the variable \"#{assignee.name}\" can't be assigned with ?= because it has not been defined."
      condition = new JS.BinaryExpression '!=', (new JS.Literal null), assignee
      new JS.ConditionalExpression condition, assignee, new JS.AssignmentExpression '=', assignee, expr expression
    ]
    [CS.FunctionApplication, ({function: fn, arguments: args}) -> new JS.CallExpression (expr fn), map args, expr]
    [CS.NewOp, ({ctor, arguments: args}) -> new JS.NewExpression ctor, args]
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
      plusOp = new JS.BinaryExpression '+', left, right
      unless ancestry[0].instanceof CS.ConcatOp
        leftmost = plusOp
        leftmost = leftmost.left while leftmost.left?.left
        unless leftmost.left.instanceof JS.Literal
          leftmost.left = new JS.BinaryExpression '+', (new JS.Literal ''), leftmost.left
      plusOp
    ]
    [CS.MemberAccessOp, ({expression}) -> memberAccess expression, @memberName]
    [CS.ProtoMemberAccessOp, ({expression}) -> memberAccess (memberAccess expression, 'prototype'), @memberName]
    [CS.DynamicMemberAccessOp, ({expression, indexingExpr}) -> dynamicMemberAccess expression, indexingExpr]
    [CS.DynamicProtoMemberAccessOp, ({expression, indexingExpr}) -> dynamicMemberAccess (memberAccess expression, 'prototype'), indexingExpr]
    [CS.SoakedMemberAccessOp, ({expression, inScope}) ->
      e = if needsCaching @expression then genSym 'cache' else expression
      condition = new JS.BinaryExpression '!=', (new JS.Literal null), e
      if (e.instanceof JS.Identifier) and e.name not in inScope
        condition = new JS.BinaryExpression '&&', (new JS.BinaryExpression '!==', (new JS.Literal 'undefined'), new JS.UnaryExpression 'typeof', e), condition
      node = new JS.ConditionalExpression condition, (memberAccess e, @memberName), helpers.undef()
      if e is expression then node
      else new JS.SequenceExpression [(new JS.AssignmentExpression '=', e, expression), node]
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
        args = for param in @expression.parameters
          switch
            when param.instanceof CS.AssignOp then param.expression
            when param.instanceof CS.Identifier, CS.MemberAccessOp then param
            else helpers.undef()
      compile new CS.FunctionApplication @expression, args
    ]
    [CS.Return, ({expression: e}) -> new JS.ReturnStatement expr e]
    [CS.Break, -> new JS.BreakStatement]
    [CS.Continue, -> new JS.ContinueStatement]

    # straightforward operators
    [CS.DivideOp, ({left, right}) -> new JS.BinaryExpression '/', (expr left), expr right]
    [CS.MultiplyOp, ({left, right}) -> new JS.BinaryExpression '*', (expr left), expr right]
    [CS.RemOp, ({left, right}) -> new JS.BinaryExpression '%', (expr left), expr right]
    [CS.PlusOp, ({left, right}) -> new JS.BinaryExpression '+', (expr left), expr right]
    [CS.SubtractOp, ({left, right}) -> new JS.BinaryExpression '-', (expr left), expr right]

    [CS.OfOp, ({left, right}) -> new JS.BinaryExpression 'in', (expr left), expr right]
    [CS.InOp, ({left, right}) ->
      if not (needsCaching left) and (@right.instanceof CS.ArrayInitialiser) and @right.members.length < 5 # TODO: and no splats
        if right.elements.length is 0 then new JS.Literal false
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
  ]

  constructor: ->
    @rules = {}
    for [ctors..., handler] in defaultRules
      for ctor in ctors
        @addRule ctor::className, handler

  addRule: (ctor, handler) ->
    @rules[ctor] = handler
    this

  # TODO: comment
  compile: do ->
    walk = (fn, inScope, ancestry, options) ->

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
      children.options = options
      children.compile = (node) ->
        walk.call node.g(), fn, inScope, ancestry

      do ancestry.shift
      fn.call this, children

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
        {declaredSymbols, usedSymbols, nsCounters} = state
        newNode = if @instanceof JS.GenSym
          newNode = new JS.Identifier generateName this, state
          usedSymbols.push newNode.name
          newNode
        else if @instanceof JS.FunctionExpression, JS.FunctionDeclaration
          params = concatMap @params, collectIdentifiers
          state.usedSymbols = nub [usedSymbols..., params...]
          state.nsCounters = {}
          state.nsCounters[k] = v for own k, v of nsCounters
          newNode = generateSymbols this, state
          newNode.body = forceBlock newNode.body
          declNames = nub difference (map (concatMap @body.body, declarationsNeededFor), (id) -> id.name), declaredSymbols
          decls = map declNames, (name) -> new JS.Identifier name
          newNode.body.body.unshift makeVarDeclaration decls if decls.length > 0
          newNode
        else generateSymbols this, state
        state.declaredSymbols = union declaredSymbols, map (declarationsNeededFor newNode), (id) -> id.name
        newNode

    defaultRule = ->
      throw new Error "compile: Non-exhaustive patterns in case: #{@className}"

    (ast, options = {}) ->
      options.bare ?= no
      rules = @rules
      jsAST = walk.call ast, (-> (rules[@className] ? defaultRule).apply this, arguments), [], [], options
      generateSymbols jsAST,
        declaredSymbols: []
        usedSymbols: jsReserved[..]
        nsCounters: {}
