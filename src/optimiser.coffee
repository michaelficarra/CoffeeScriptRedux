{concat, foldl, foldl1} = require './helpers'
for name, node of require './nodes'
  global[if name of global then "CS#{name}" else name] = node

declarationsFor = (vars) ->
  foldl (new Undefined).g(), vars, (expr, v) ->
    (new AssignOp v, expr).g()

# TODO: better comments
# TODO: make sure I can't split any of these rules into sets of smaller rules

class @Optimiser

  defaultRules = [
    # dead code removal
    [Program, -> if @block? and @block.mayHaveSideEffects [] then this else new Program null]
    [Block, (inScope, ancestors) ->
      canDropLast = not @usedAsExpression ancestors
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
    [SeqOp, (inScope, ancestors) ->
      if @left.mayHaveSideEffects inScope
        if @right.mayHaveSideEffects() or @usedAsExpression ancestors then this else @left
      else if (@right.instanceof Identifier) and @right.data is 'eval'
        return this if (@left.instanceof Int) and @left.data is 0
        return new SeqOp (new Int 0).g(), @right
      else
        @right
    ]
    [AssignOp, ->
      return this unless @expr.instanceof SeqOp
      new SeqOp @expr.left, new AssignOp @assignee, @expr.right
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
      block = new SeqOp (declarationsFor removedBlock.envEnrichments()), block if removedBlock?
      if @condition.mayHaveSideEffects inScope
        block = new SeqOp @condition, block
      block
    ]
    # for-in over empty list
    [ForIn, (inScope, ancestors) ->
      return this unless (@expr.instanceof ArrayInitialiser) and @expr.members.length is 0
      retVal = if @usedAsExpression ancestors then new ArrayInitialiser [] else new Undefined
      new SeqOp (declarationsFor @envEnrichments()), retVal.g()
    ]
    # for-own-of over empty object
    [ForOf, ->
      return this unless (@expr.instanceof ObjectInitialiser) and @expr.isOwn and @expr.members.length is 0
      retVal = if @usedAsExpression ancestors then new ArrayInitialiser [] else new Undefined
      new SeqOp (declarationsFor @envEnrichments()), retVal.g()
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
    [ExistsOp, -> if @left.instanceof Null, Undefined then @right else this]
    [UnaryExistsOp, -> if @expr.instanceof Null, Undefined then (new Bool false).g() else this]
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
    for [ctors..., handler] in defaultRules
      for ctor in ctors
        @addRule ctor::className, handler

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
