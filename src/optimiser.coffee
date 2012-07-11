{concat} = require './helpers'
for name, node of require './nodes'
  global[if name of global then "CS#{name}" else name] = node

class @Optimiser

  defaultRules = [
    # dead code removal
    [[Block], (inScope, ancestors) ->
      canDropLast = ancestors[0]?.instanceof Program, Class
      changed = no
      newNode = new Block concat do =>
        for s, i in @statements
          unless (s.mayHaveSideEffects inScope) or (not canDropLast and i + 1 is @statements.length)
            changed = yes
            continue
          if s.instanceof SeqOp
            changed = yes
            [s.left, s.right]
          else [s]
      return this unless changed
      newNode = switch newNode.statements.length
        when 0
          if canDropLast then newNode else (new Undefined).g()
        when 1 then newNode.statements[0]
        else newNode
      newNode.r(@raw).p @line, @column
    ]
    [[SeqOp], (inScope) ->
      return this if (@right.instanceof Identifier) and @right.data is 'eval'
      return @right.r(@raw).p @line, @column unless @left.mayHaveSideEffects inScope
      this
    ]
    [[While], (inScope) ->
      if @condition.isFalsey()
        return if @condition.mayHaveSideEffects inScope
          # while (falsey with side effects) -> the condition
          @condition
        else
          # while (falsey without side effects) -> nothing
          (new Undefined).g()
      if @condition.isTruthy()
        # while (truthy without side effects) -> loop
        unless @condition.mayHaveSideEffects inScope
          return (new Undefined).g() unless @block?
          return this if this instanceof Loop
          return (new Loop @block).g().r(@raw).p @line, @column
      this
    ]
    [[Conditional], (inScope) ->
      if @condition.isFalsey()
        block = @elseBlock
      else if @condition.isTruthy()
        block = @block
      else
        return this
      return (new Undefined).g() unless block?
      if @condition.mayHaveSideEffects inScope
        @condition.unshift block
      block
    ]
    # for-in over empty list
    [[ForIn], ->
      return this unless (@expr.instanceof ArrayInitialiser) and @expr.members.length is 0
      (new ArrayInitialiser []).g().r(@raw).p @line, @column
    ]
    # for-own-of over empty object
    [[ForOf], ->
      return this unless (@expr.instanceof ObjectInitialiser) and @expr.isOwn and @expr.members.length is 0
      (new ArrayInitialiser []).g().r(@raw).p @line, @column
    ]
    # DoOp -> FunctionApplication
    # TODO: move this to compiler internals
    #[[DoOp], ->
    #  args = []
    #  if @expr.className is 'Function'
    #    args = for param in @expr.parameters
    #      switch param.className
    #        when AssignOp::className then param.expr
    #        when Identifier::className, MemberAccessOp::className then param
    #        else (new Undefined).g()
    #  (new FunctionApplication @expr, args).g().p @line, @column
    #]
    # LogicalNotOp applied to a literal or !!
    [[LogicalNotOp], ->
      newNode = switch @expr.className
        when Int::className, Float::className, String::className, Bool::className
          (new Bool !@expr.data).g()
        when Function::className, BoundFunction::className then (new Bool false).g()
        when Null::className, Undefined::className then (new Bool true).g()
        when ArrayInitialiser::className, ObjectInitialiser::className
          if @expr.mayHaveSideEffects() then this
          else (new Bool false).g()
        when LogicalNotOp::className
          if @expr.expr.instanceof LogicalNotOp then @expr.expr
          else this
        else this
      return this if newNode is this
      newNode.r(@raw).p @line, @column
    ]
    # typeof on any literal
    [[TypeofOp], ->
      switch @expr.className
        when Int::className, Float::className, UnaryNegateOp::className, UnaryPlusOp::className
          (new String 'number').g()
        when String::className then (new String 'string').g()
        when Function::className, BoundFunction::className then (new String 'function').g()
        when Undefined::className then (new String 'undefined').g()
        # TODO: comprehensive
        else this
    ]
  ]

  constructor: ->
    @rules = {}
    for [applicableCtors, handler] in defaultRules
      @addRule ctor::className, handler for ctor in applicableCtors

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
