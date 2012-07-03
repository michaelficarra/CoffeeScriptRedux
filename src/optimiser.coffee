class @Optimiser
  constructor: ->
    @rules = {}
    for [directions, applicableCtors, handler] in defaultRules
      @addRule directions, ctor, handler for ctor in applicableCtors

  addRule: (directions, ctor, handler) ->
    for own dir of directions
      ((@rules[dir] ?= {})[ctor] ?= []).push handler
    return

down = up = yes

defaultRules = [
  # dead code removal
  [{down, up}, ['Block'], (node) ->
    newNode = Block.wrap do ->
      canDropLast = ancestors[0]?.className is 'Program'
      blockSize = block.statements.length
      for s, i in block.statements
        isLast = i + 1 is blockSize
        continue unless s.mayHaveSideEffects() or (isLast and not canDropLast)
        s
    newNode.r(node.raw).p node.line, node.column
  ]
  # TODO: conditionals and whiles with falsey conditions
  # for-in over empty list
  [{down}, ['ForIn'], (node) ->
    return node unless node.expr.className is 'ArrayInitialiser' and node.expr.members.length is 0
    (new ArrayInitialiser []).g().r(node.raw).p node.line, node.column
  ]
  # for-own-of over empty object
  [{down}, ['ForOf'], (node) ->
    return node unless node.expr.className is 'ObjectInitialiser' and node.expr.isOwn and node.expr.members.length is 0
    (new ArrayInitialiser []).g().r(node.raw).p node.line, node.column
  ]
  # coffeescript-naught: DoOp -> FunctionApplication
  [{down}, ['DoOp'], (node) ->
    args = []
    if node.expr.className is 'Function'
      args = do ->
        for param in node.expr.parameters
          switch param.className
            when 'AssignOp' then param.expr
            when  'Identifier', 'MemberExpression' then param
    (new FunctionApplication node.expr, args).g().p node.line, node.column
  ]
  # TODO: while (truthy without side effects) -> loop
  # TODO: while (falsey without side effects) -> nothing
  # TODO: while (falsey with side effects) -> the condition
  # LogicalNotOp applied to a literal or !!
  [{up}, ['LogicalNotOp'], (node, ancestors) ->
    newNode = switch node.expr.className
      when 'Int', 'Float', 'String', 'Bool' then (new Bool !node.expr.data).g()
      when 'Function', 'BoundFunction' then (new Bool false).g()
      when 'Null', 'Undefined' then (new Bool true).g()
      when 'ArrayInitialiser', 'ObjectInitialiser'
        if node.expr.mayHaveSideEffects() then node
        else (new Bool false).g()
      when 'LogicalNotOp'
        if node.expr.expr.className is 'LogicalNotOp' then node.expr.expr
        else node
      else node
    if newNode is node then node
    else newNode.r(node.raw).p node.line, node.column
  ]
]
