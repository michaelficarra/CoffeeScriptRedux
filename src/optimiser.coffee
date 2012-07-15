{concat, foldl, foldl1} = require './helpers'
for name, node of require './nodes'
  global[if name of global then "CS#{name}" else name] = node

declarationsFor = (vars) ->
  foldl (new Undefined).g(), vars, (expr, v) ->
    (new AssignOp v, expr).g()

class @Optimiser

  defaultRules = [
    # dead code removal
    [Block, (inScope, ancestors) ->
      # TODO: really, I need some `usedAsExpression` predicate, and this would
      # be true when `this.usedAsExpression ancestors` says false
      canDropLast = ancestors[0]?.instanceof Program, Class
      stmts = concat do =>
        for s, i in @statements then switch
          when (not s.mayHaveSideEffects inScope) and (canDropLast or i + 1 isnt @statements.length)
            [declarationsFor s.envEnrichments()]
          when s.instanceof Block then s.statements
          when s.instanceof SeqOp then [s.left, s.right]
          else [s]
      switch stmts.length
        when 0 then (new Undefined).g()
        when 1 then stmts[0]
        else foldl1 stmts, (expr, s) ->
          new SeqOp expr, s
    ]
    [SeqOp, (inScope) ->
      return this if @left.mayHaveSideEffects inScope
      if (@right.instanceof Identifier) and @right.data is 'eval'
        return this if (@left.instanceof Int) and @left.data is 0
        return new SeqOp (new Int 0).g(), @right
      @right
    ]
    [While, (inScope) ->
      if @condition.isFalsey()
        return if @condition.mayHaveSideEffects inScope
          # while (falsey with side effects) -> the condition
          @condition
        else
          # while (falsey without side effects) -> nothing
          if block?
            declarationsFor @block.envEnrichments()
          else
            (new Undefined).g()
      if @condition.isTruthy()
        # while (truthy without side effects) -> loop
        unless @condition.mayHaveSideEffects inScope
          return (new Undefined).g() unless @block?
          return this if this instanceof Loop
          return (new Loop @block).g()
      this
    ]
    [Conditional, (inScope) ->
      if @condition.isFalsey()
        block = @elseBlock
        removedBlock = @block
      else if @condition.isTruthy()
        block = @block
        removedBlock = @elseBlock
      else
        return this
      block = Block.wrap block
      block.statements.unshift declarationsFor removedBlock.envEnrichments() if removedBlock?
      if @condition.mayHaveSideEffects inScope
        @condition.unshift block
      block
    ]
    # for-in over empty list
    [ForIn, ->
      return this unless (@expr.instanceof ArrayInitialiser) and @expr.members.length is 0
      new SeqOp (declarationsFor @envEnrichments()), (new ArrayInitialiser []).g()
    ]
    # for-own-of over empty object
    [ForOf, ->
      return this unless (@expr.instanceof ObjectInitialiser) and @expr.isOwn and @expr.members.length is 0
      new SeqOp (declarationsFor @envEnrichments()), (new ArrayInitialiser []).g()
    ]
    # DoOp -> FunctionApplication
    # TODO: move this to compiler internals
    #[DoOp, ->
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
    [LogicalNotOp, ->
      switch @expr.className
        when Int::className, Float::className, String::className, Bool::className
          (new Bool !@expr.data).g()
        when Function::className, BoundFunction::className then (new Bool false).g()
        when Null::className, Undefined::className then (new Bool true).g()
        when ArrayInitialiser::className, ObjectInitialiser::className
          if @expr.mayHaveSideEffects() then this
          else new SeqOp (declarationsFor @expr.envEnrichments()), (new Bool false).g()
        when LogicalNotOp::className
          if @expr.expr.instanceof LogicalNotOp then @expr.expr
          else this
        else this
    ]
    # typeof on any literal
    [TypeofOp, ->
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
    @addRule ctor::className, handler for [ctor, handler] in defaultRules

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
