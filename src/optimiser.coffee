class @Optimiser
  constructor: ->
    @rules = {}
    for [applicableCtors, handler] in defaultRules
      @addRule ctor.className, handler for ctor in applicableCtors

  addRule: (ctor, handler) ->
    (@rules[ctor] ?= []).push handler
    return

  optimise: (ast) ->
    rules = @rules
    ast.walk (inScope, ancestry) ->
      # not a fold for efficiency's sake
      memo = this
      for rule in rules[@className] ? []
        memo = rule.call memo, inScope, ancestry
      memo

defaultRules = [
  # dead code removal
  [[Block], (inScope, ancestors) ->
    newNode = Block.wrap do ->
      canDropLast = ancestors[0]?.className is 'Program'
      blockSize = block.statements.length
      for s, i in block.statements
        isLast = i + 1 is blockSize
        continue unless (s.mayHaveSideEffects inScope) or (isLast and not canDropLast)
        s
    newNode.r(@raw).p @line, @column
  ]
  [[While], (inScope) ->
    if @condition.isFalsey()
      # while (falsey without side effects) -> nothing
      # while (falsey with side effects) -> the condition
      return if @condition.mayHaveSideEffects inScope then @condition else (new Null).g()
    if @condition.isTruthy()
      # while (truthy without side effects) -> loop
      unless @condition.mayHaveSideEffects inScope
        return new Loop @block
    this
  ]
  # TODO: conditionals with truthy/falsey conditions
  # for-in over empty list
  [[ForIn], ->
    return this unless @expr.className is 'ArrayInitialiser' and @expr.members.length is 0
    (new ArrayInitialiser []).g().r(@raw).p @line, @column
  ]
  # for-own-of over empty object
  [[ForOf], ->
    return this unless @expr.className is 'ObjectInitialiser' and @expr.isOwn and @expr.members.length is 0
    (new ArrayInitialiser []).g().r(@raw).p @line, @column
  ]
  # DoOp -> FunctionApplication
  # TODO: move this to compiler internals
  [[DoOp], ->
    args = []
    if @expr.className is 'Function'
      args = do ->
        for param in @expr.parameters
          switch param.className
            when 'AssignOp' then param.expr
            when 'Identifier', 'MemberAccessOp' then param
            else (new Undefined).g()
    (new FunctionApplication @expr, args).g().p @line, @column
  ]
  # LogicalNotOp applied to a literal or !!
  [[LogicalNotOp], ->
    newNode = switch @expr.className
      when 'Int', 'Float', 'String', 'Bool' then (new Bool !@expr.data).g()
      when 'Function', 'BoundFunction' then (new Bool false).g()
      when 'Null', 'Undefined' then (new Bool true).g()
      when 'ArrayInitialiser', 'ObjectInitialiser'
        if @expr.mayHaveSideEffects() then this
        else (new Bool false).g()
      when 'LogicalNotOp'
        if @expr.expr.className is 'LogicalNotOp' then @expr.expr
        else this
      else this
    return this if newNode is this
    newNode.r(@raw).p @line, @column
  ]
  # TODO: typeof on any literal
]
