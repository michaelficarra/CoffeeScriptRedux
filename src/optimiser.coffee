{any, concat, concatMap, difference, foldl, foldl1} = require './functional-helpers'
{beingDeclared, declarationsFor, usedAsExpression} = require './helpers'
CS = require './nodes'

isTruthy_ = -> switch
  when @instanceof CS.ArrayInitialiser, CS.Class, CS.DeleteOp, CS.ForIn, CS.ForOf, CS.Function, CS.BoundFunction, CS.HeregExp, CS.ObjectInitialiser, CS.Range, CS.RegExp, CS.Slice, CS.TypeofOp, CS.While then yes
  when @instanceof CS.AssignOp then isTruthy @expr
  when @instanceof CS.Block
    if @statements.length is 0 then no
    else isTruthy @statements[@statements.length - 1]
  when @instanceof CS.Bool, CS.Float, CS.Int, CS.String then !!@data
  when @instanceof CS.Conditional
    (isTruthy @condition) and (isTruthy @block) or
    (isFalsey @condition) and isTruthy @elseBlock
  when @instanceof CS.LogicalAndOp then (isTruthy @left) and isTruthy @right
  when @instanceof CS.LogicalNotOp then isFalsey @expr
  when @instanceof CS.LogicalOrOp then (isTruthy @left) or isTruthy @right
  when @instanceof CS.Program then isTruthy @block
  when @instanceof CS.SeqOp then isTruthy @right
  # TODO: Switch: all case blocks are truthy
  when @instanceof CS.UnaryExistsOp
    (isTruthy @expr) or
    # TODO: comprehensive list of all possibly-falsey and always non-null expressions
    @expr.instanceof CS.Int, CS.Float, CS.String, CS.UnaryPlusOp, CS.UnaryNegateOp, CS.LogicalNotOp
  else no

isFalsey_ = -> switch
  when @instanceof CS.Null, CS.Undefined then yes
  when @instanceof CS.AssignOp then isFalsey @expr
  when @instanceof CS.Block
    if @statements.length is 0 then yes
    else isFalsey @statements[@statements.length - 1]
  when @instanceof CS.Bool, CS.Float, CS.Int, CS.String then not @data
  when @instanceof CS.Conditional
    (isTruthy @condition) and (isFalsey @block) or
    (isFalsey @condition) and isFalsey @elseBlock
  when @instanceof CS.LogicalAndOp then (isFalsey @left) or isFalsey @right
  when @instanceof CS.LogicalNotOp then isTruthy @expr
  when @instanceof CS.LogicalOrOp then (isFalsey @left) and isFalsey @right
  when @instanceof CS.Program then isFalsey @block
  when @instanceof CS.SeqOp then isFalsey @right
  # TODO: Switch: all case blocks are falsey
  when @instanceof CS.UnaryExistsOp then @expr.instanceof CS.Null, CS.Undefined
  else no

# TODO: generate a mapping from Constructor::className to function with appropriate behaviour
# TODO: make sure `inScope` is really necessary where we use it
mayHaveSideEffects_ = (inScope) -> switch
  when @instanceof CS.ClassProtoAssignOp, CS.Function, CS.BoundFunction, CS.Null, CS.RegExp, CS.This, CS.Undefined then no
  when @instanceof CS.Break, CS.Continue, CS.DeleteOp, CS.NewOp, CS.PreDecrementOp, CS.PreIncrementOp, CS.PostDecrementOp, CS.PostIncrementOp, CS.Return, CS.Super then yes
  when @instanceof CS.ArrayInitialiser then any @members, (m) -> mayHaveSideEffects m, inScope
  when @instanceof CS.Block then any @statements, (s) -> mayHaveSideEffects s, inScope
  when @instanceof CS.Class
    (mayHaveSideEffects @parent, inScope) or
    @nameAssignment? and (@name or (beingDeclared @nameAssignment).length > 0)
  when @instanceof CS.Conditional
    (mayHaveSideEffects @condition, inScope) or
    (not isFalsey @condition) and (mayHaveSideEffects @block, inScope) or
    (not isTruthy @condition) and mayHaveSideEffects @elseBlock, inScope
  when @instanceof CS.DoOp then do =>
    return yes unless @expr.instanceof CS.Function, CS.BoundFunction
    newScope = difference inScope, concatMap @expr.parameters, beingDeclared
    args = for p in @expr.parameters
      if p.instanceof CS.AssignOp then p.expr else p
    return yes if any args, (a) -> mayHaveSideEffects a, newScope
    mayHaveSideEffects @expr, newScope
  when @instanceof CS.FunctionApplication then do =>
    return yes unless @function.instanceof CS.Function, CS.BoundFunction
    newScope = difference inScope, concatMap @function.parameters, beingDeclared
    return yes if any @arguments, (a) -> mayHaveSideEffects a, newScope
    mayHaveSideEffects @function.block, newScope
  when @instanceof CS.ObjectInitialiser
    any @members, ([key, expr]) ->
      (mayHaveSideEffects key, inScope) or mayHaveSideEffects expr, inScope
  when @instanceof CS.Switch then do =>
    otherExprs = concat ([(cond for cond in conds)..., block] for [conds, block] in @cases)
    any [@expr, @elseBlock, otherExprs...], (e) -> mayHaveSideEffects e, inScope
  when @instanceof CS.While
    (mayHaveSideEffects @condition, inScope) or
    (not isFalsey @condition) and mayHaveSideEffects @block, inScope
  # category: AssignOp
  when @instanceof CS.AssignOp, CS.ClassProtoAssignOp, CS.CompoundAssignOp, CS.ExistsAssignOp
    (mayHaveSideEffects @expr, inScope) or (beingDeclared @assignee).length
  # category: Primitive
  when @instanceof CS.Bool, CS.Float, CS.Identifier, CS.Int, CS.JavaScript, CS.String then no
  else any @childNodes, (child) => mayHaveSideEffects @[child], inScope

isTruthy = (node) -> if node? then  isTruthy_.call node else no
isFalsey = (node) -> if node? then isFalsey_.call node else no
mayHaveSideEffects = (node, inScope) -> if node? then mayHaveSideEffects_.call node, inScope else no

# TODO: better comments
# TODO: make sure I can't split any of these rules into sets of smaller rules

class @Optimiser

  # expose helpers so people have an easy time writing their own rules
  @isTruthy = isTruthy
  @isFalsey = isFalsey
  @mayHaveSideEffects = mayHaveSideEffects

  defaultRules = [

    [CS.Program, -> if @block? and mayHaveSideEffects @block, [] then this else new CS.Program null]

    [CS.Block, (inScope, ancestors) ->
      canDropLast = not usedAsExpression this, ancestors
      stmts = concat do =>
        for s, i in @statements then switch
          when (not mayHaveSideEffects s, inScope) and (canDropLast or i + 1 isnt @statements.length)
            [declarationsFor s]
          when s.instanceof CS.Block then s.statements
          when s.instanceof CS.SeqOp then [s.left, s.right]
          else [s]
      switch stmts.length
        when 0 then (new CS.Undefined).g()
        when 1 then stmts[0]
        else foldl1 stmts, (expr, s) ->
          new CS.SeqOp expr, s
    ]

    [CS.SeqOp, (inScope, ancestors) ->
      if mayHaveSideEffects @left, inScope
        if (mayHaveSideEffects @right, inScope) or usedAsExpression this, ancestors then this else @left
      else if (@right.instanceof CS.Identifier) and @right.data is 'eval'
        return this if (@left.instanceof CS.Int) and @left.data is 0
        return new CS.SeqOp (new CS.Int 0).g(), @right
      else
        @right
    ]

    [CS.AssignOp, ->
      return this unless @expr.instanceof CS.SeqOp
      new CS.SeqOp @expr.left, new CS.AssignOp @assignee, @expr.right
    ]

    [CS.While, (inScope) ->
      if isFalsey @condition
        return if mayHaveSideEffects @condition, inScope
          # while (falsey with side effects) -> the condition
          @condition
        else
          # while (falsey without side effects) -> nothing
          if block?
            declarationsFor @block
          else
            (new CS.Undefined).g()
      if isTruthy @condition
        # while (truthy without side effects) -> loop
        unless mayHaveSideEffects @condition, inScope
          return (new CS.Undefined).g() unless @block?
          return this if this instanceof CS.Loop
          return (new CS.Loop @block).g()
      this
    ]

    [CS.Conditional, (inScope) ->
      if isFalsey @condition
        block = @elseBlock
        removedBlock = @block
      else if isTruthy @condition
        block = @block
        removedBlock = @elseBlock
      else
        return this
      block = new CS.SeqOp (declarationsFor removedBlock), block if removedBlock?
      if mayHaveSideEffects @condition, inScope
        block = new CS.SeqOp @condition, block
      block
    ]

    # for-in over empty list
    [CS.ForIn, (inScope, ancestors) ->
      return this unless (@expr.instanceof CS.ArrayInitialiser) and @expr.members.length is 0
      retVal = if usedAsExpression this, ancestors then new CS.ArrayInitialiser [] else new CS.Undefined
      new CS.SeqOp (declarationsFor this), retVal.g()
    ]

    # for-own-of over empty object
    [CS.ForOf, ->
      return this unless (@expr.instanceof CS.ObjectInitialiser) and @expr.isOwn and @expr.members.length is 0
      retVal = if usedAsExpression this, ancestors then new CS.ArrayInitialiser [] else new CS.Undefined
      new CS.SeqOp (declarationsFor this), retVal.g()
    ]

    # DoOp -> FunctionApplication
    # TODO: move this to compiler internals
    #[CS.DoOp, ->
    #  args = []
    #  if @expr.instanceof CS.Function
    #    args = for param in @expr.parameters
    #      switch
    #        when param.instanceof CS.AssignOp then param.expr
    #        when param.instanceof CS.Identifier, CS.MemberAccessOp then param
    #        else (new CS.Undefined).g()
    #  (new CS.FunctionApplication @expr, args).g().p @line, @column
    #]

    [CS.ExistsOp, -> if @left.instanceof CS.Null, CS.Undefined then @right else this]

    [CS.UnaryExistsOp, -> if @expr.instanceof CS.Null, CS.Undefined then (new CS.Bool false).g() else this]

    # LogicalNotOp applied to a literal or !!
    [CS.LogicalNotOp, (inScope) ->
      switch
        when @expr.instanceof CS.Int, CS.Float, CS.String, CS.Bool
          (new Bool !@expr.data).g()
        when @expr.instanceof CS.Function, CS.BoundFunction then (new CS.Bool false).g()
        when @expr.instanceof CS.Null, CS.Undefined then (new CS.Bool true).g()
        when @expr.instanceof CS.ArrayInitialiser, CS.ObjectInitialiser
          if mayHaveSideEffects @expr, inScope then this
          else new CS.SeqOp (declarationsFor @expr), (new CS.Bool false).g()
        when @expr.instanceof CS.LogicalNotOp
          if @expr.expr.instanceof CS.LogicalNotOp then @expr.expr
          else this
        else this
    ]

    # typeof on any literal
    [CS.TypeofOp, ->
      switch
        when @expr.instanceof CS.Int, CS.Float, CS.UnaryNegateOp, CS.UnaryPlusOp
          (new String 'number').g()
        when @expr.instanceof CS.String then (new CS.String 'string').g()
        when @expr.instanceof CS.Function, CS.BoundFunction then (new CS.String 'function').g()
        when @expr.instanceof CS.Undefined then (new CS.String 'undefined').g()
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
