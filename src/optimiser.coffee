{all, any, concat, concatMap, difference, foldl, foldl1, union} = require './functional-helpers'
{beingDeclared, declarationsFor, usedAsExpression, envEnrichments} = require './helpers'
CS = require './nodes'
exports = module?.exports ? this

makeDispatcher = (defaultValue, handlers, defaultHandler = (->)) ->
  handlers_ = {}
  for [ctors, handler] in handlers
    handlers_[ctor::className] = handler for ctor in ctors
  (node, args...) ->
    return defaultValue unless node?
    handler =
      if Object::hasOwnProperty.call handlers_, node.className
        handlers_[node.className]
      else defaultHandler
    handler.apply node, args


isTruthy =
  makeDispatcher no, [
    [[
      CS.ArrayInitialiser, CS.Class, CS.DeleteOp, CS.ForIn, CS.ForOf
      CS.Function, CS.BoundFunction, CS.HeregExp, CS.ObjectInitialiser, CS.Range
      CS.RegExp, CS.Slice, CS.TypeofOp, CS.While
    ], -> yes]
    [[CS.AssignOp], -> isTruthy @expression]
    [[CS.Block], ->
      if @statements.length is 0 then no
      else isTruthy @statements[@statements.length - 1]
    ]
    [[CS.Bool, CS.Float, CS.Int, CS.String], -> !!@data]
    [[CS.Conditional], ->
      (isTruthy @condition) and (isTruthy @block) or
      (isFalsey @condition) and isTruthy @elseBlock
    ]
    [[CS.LogicalAndOp], -> (isTruthy @left) and isTruthy @right]
    [[CS.LogicalNotOp], -> isFalsey @expression]
    [[CS.LogicalOrOp], -> (isTruthy @left) or isTruthy @right]
    [[CS.Program], -> isTruthy @block]
    [[CS.SeqOp], -> isTruthy @right]
    [[CS.Switch], ->
      (all @cases, isTruthy) and
      if @elseBlock? then isTruthy @elseBlock else yes
    ]
    [[CS.SwitchCase], -> isTruthy @block]
    [[CS.UnaryExistsOp], ->
      (isTruthy @expression) or
      # TODO: comprehensive list of all possibly-falsey and always non-null expressions
      @expression.instanceof CS.Int, CS.Float, CS.String, CS.UnaryPlusOp, CS.UnaryNegateOp, CS.LogicalNotOp
    ]
  ], -> no

isFalsey =
  makeDispatcher no, [
    [[CS.Null, CS.Undefined], -> yes]
    [[CS.AssignOp], -> isFalsey @expression]
    [[CS.Block], ->
      if @statements.length is 0 then yes
      else isFalsey @statements[@statements.length - 1]
    ]
    [[CS.Bool, CS.Float, CS.Int, CS.String], -> not @data]
    [[CS.Conditional], ->
      (isTruthy @condition) and (isFalsey @block) or
      (isFalsey @condition) and isFalsey @elseBlock
    ]
    [[CS.LogicalAndOp], -> (isFalsey @left) or isFalsey @right]
    [[CS.LogicalNotOp], -> isTruthy @expression]
    [[CS.LogicalOrOp], -> (isFalsey @left) and isFalsey @right]
    [[CS.Program], -> isFalsey @block]
    [[CS.SeqOp], -> isFalsey @right]
    [[CS.Switch], ->
      (all @cases, isFalsey) and
      if @elseBlock? then isFalsey @elseBlock else yes
    ]
    [[CS.SwitchCase], -> isFalsey @block]
    [[CS.UnaryExistsOp], -> @expression.instanceof CS.Null, CS.Undefined]
  ], -> no

# TODO: make sure `inScope` is really necessary where we use it
mayHaveSideEffects =
  makeDispatcher no, [
    [[
      CS.ClassProtoAssignOp, CS.Function, CS.BoundFunction, CS.Null, CS.RegExp
      CS.This, CS.Undefined
    ], -> no]
    [[
      CS.Break, CS.Continue, CS.DeleteOp, CS.NewOp, CS.Return, CS.Super
      CS.PreDecrementOp, CS.PreIncrementOp, CS.PostDecrementOp, CS.PostIncrementOp
    ], -> yes]
    [[CS.ArrayInitialiser], (inScope) -> any @members, (m) -> mayHaveSideEffects m, inScope]
    [[CS.Block], (inScope) -> any @statements, (s) -> mayHaveSideEffects s, inScope]
    [[CS.Class], (inScope) ->
      (mayHaveSideEffects @parent, inScope) or
      @nameAssignment? and (@name or (beingDeclared @nameAssignment).length > 0)
    ]
    [[CS.Conditional], (inScope) ->
      (mayHaveSideEffects @condition, inScope) or
      (not isFalsey @condition) and (mayHaveSideEffects @block, inScope) or
      (not isTruthy @condition) and mayHaveSideEffects @elseBlock, inScope
    ]
    [[CS.DoOp], (inScope) ->
      return yes unless @expression.instanceof CS.Function, CS.BoundFunction
      newScope = difference inScope, concatMap @expression.parameters, beingDeclared
      args = for p in @expression.parameters
        if p.instanceof CS.AssignOp then p.expression else p
      return yes if any args, (a) -> mayHaveSideEffects a, newScope
      mayHaveSideEffects @expression, newScope
    ]
    [[CS.ExistsOp], (inScope) ->
      return yes if mayHaveSideEffects @left, inScope
      return no if @left.instanceof CS.Undefined, CS.Null
      mayHaveSideEffects @right, inScope
    ]
    [[CS.FunctionApplication], (inScope) ->
      return yes unless @function.instanceof CS.Function, CS.BoundFunction
      newScope = difference inScope, concatMap @function.parameters, beingDeclared
      return yes if any @arguments, (a) -> mayHaveSideEffects a, newScope
      mayHaveSideEffects @function.block, newScope
    ]
    [[CS.LogicalAndOp], (inScope) ->
      return yes if mayHaveSideEffects @left, inScope
      return no if isFalsey @left
      mayHaveSideEffects @right, inScope
    ]
    [[CS.LogicalOrOp], (inScope) ->
      return yes if mayHaveSideEffects @left, inScope
      return no if isTruthy @left
      mayHaveSideEffects @right, inScope
    ]
    [[CS.ObjectInitialiser], (inScope) ->
      any @members, (m) -> mayHaveSideEffects m, inScope
    ]
    [[CS.ObjectInitialiserMember], (inScope) ->
      (mayHaveSideEffects @key, inScope) or mayHaveSideEffects @expression, inScope
    ]
    [[CS.Switch], (inScope) ->
      any [@expression, @elseBlock, @cases...], (e) -> mayHaveSideEffects e, inScope
    ]
    [[CS.SwitchCase], (inScope) ->
      any [@block, @conditions...], (e) -> mayHaveSideEffects e, inScope
    ]
    [[CS.While], (inScope) ->
      (mayHaveSideEffects @condition, inScope) or
      (not isFalsey @condition) and mayHaveSideEffects @block, inScope
    ]
    # category: AssignOp
    [[CS.AssignOp, CS.ClassProtoAssignOp, CS.CompoundAssignOp, CS.ExistsAssignOp], (inScope) ->
      (mayHaveSideEffects @expression, inScope) or (beingDeclared @assignee).length > 0
    ]
    # category: Primitive
    [[CS.Bool, CS.Float, CS.Identifier, CS.Int, CS.JavaScript, CS.String], -> no]
  ], (inScope) ->
    any @childNodes, (child) => mayHaveSideEffects @[child], inScope



class exports.Optimiser

  # expose helpers so people have an easy time writing their own rules
  @isTruthy = isTruthy
  @isFalsey = isFalsey
  @mayHaveSideEffects = mayHaveSideEffects

  # TODO: preserve source information in these trainsformations
  # TODO: change signature of these functions to named parameters
  defaultRules = [

    # If a program has no side effects, then it is the empty program
    [CS.Program, ->
      if @block? and mayHaveSideEffects @block, [] then this
      else new CS.Program null
    ]

    # Turn blocks into expressions
    [CS.Block, (inScope, ancestors) ->
      foldl (new CS.Undefined).g(), @statements, (expr, s) ->
        new CS.SeqOp expr, s
    ]

    # Reject unused and inconsequential expressions
    [CS.SeqOp, (inScope, ancestors) ->
      if mayHaveSideEffects @left, inScope
        if (mayHaveSideEffects @right, inScope) or usedAsExpression this, ancestors then this else @left
      else if (@right.instanceof CS.Identifier) and @right.data is 'eval'
        return this if (@left.instanceof CS.Int) and @left.data is 0
        return new CS.SeqOp (new CS.Int 0).g(), @right
      else
        canDropLast = not usedAsExpression this, ancestors
        if canDropLast and not mayHaveSideEffects @right, inScope
          (new CS.Undefined).g()
        else @right
    ]

    # Push assignments through sequences
    [CS.AssignOp, ->
      return this unless @expression.instanceof CS.SeqOp
      new CS.SeqOp @expression.left, new CS.AssignOp @assignee, @expression.right
    ]

    # A falsey condition with side effects -> the condition
    # A falsey condition without side effects -> the undefined value
    # A truthy condition without side effects -> a loop
    [CS.While, (inScope) ->
      if isFalsey @condition
        return if mayHaveSideEffects @condition, inScope
          @condition
        else
          if block?
            declarationsFor @block
          else
            (new CS.Undefined).g()
      if isTruthy @condition
        unless mayHaveSideEffects @condition, inScope
          return (new CS.Undefined).g() unless @block?
          return this if this instanceof CS.Loop
          return (new CS.Loop @block).g()
      this
    ]

    # Produce the consequent when the condition is truthy
    # Produce the alternative when the condition is falsey
    # Prepend the condition if it has side effects
    [CS.Conditional, (inScope) ->
      if isFalsey @condition
        decls = declarationsFor @block
        block = if @elseBlock? then new CS.SeqOp decls, @elseBlock else decls
      else if isTruthy @condition
        decls = declarationsFor @elseBlock
        block = if @block? then new CS.SeqOp @block, decls else decls
      else
        return this
      if mayHaveSideEffects @condition, inScope
        block = new CS.SeqOp @condition, block
      block
    ]

    # for-in over an empty list produces an empty list
    [CS.ForIn, (inScope, ancestors) ->
      return this unless (@expression.instanceof CS.ArrayInitialiser) and @expression.members.length is 0
      retVal = if usedAsExpression this, ancestors then new CS.ArrayInitialiser [] else new CS.Undefined
      new CS.SeqOp (declarationsFor this), retVal.g()
    ]

    # for-own-of over empty object produces an empty list
    [CS.ForOf, ->
      return this unless (@expression.instanceof CS.ObjectInitialiser) and @expression.isOwn and @expression.members.length is 0
      retVal = if usedAsExpression this, ancestors then new CS.ArrayInitialiser [] else new CS.Undefined
      new CS.SeqOp (declarationsFor this), retVal.g()
    ]

    # DoOp -> FunctionApplication
    # TODO: move this to compiler internals
    #[CS.DoOp, ->
    #  args = []
    #  if @expression.instanceof CS.Function
    #    args = for param in @expression.parameters
    #      switch
    #        when param.instanceof CS.AssignOp then param.expression
    #        when param.instanceof CS.Identifier, CS.MemberAccessOp then param
    #        else (new CS.Undefined).g()
    #  (new CS.FunctionApplication @expression, args).g().p @line, @column
    #]

    # Array members without side effects can be dropped when the array is in statement position
    [CS.ArrayInitialiser, (inScope, ancestors) ->
      return this if usedAsExpression this, ancestors
      originalLength = @members.length
      members = (m for m in @members when mayHaveSideEffects m, inScope)
      if members.length is originalLength then this
      else (new CS.ArrayInitialiser members).g()
    ]

    # Produce the right operand when the left operand is null or undefined
    [CS.ExistsOp, -> if @left.instanceof CS.Null, CS.Undefined then @right else this]

    # Produce false when the expression is null or undefined
    [CS.UnaryExistsOp, -> if @expression.instanceof CS.Null, CS.Undefined then (new CS.Bool false).g() else this]

    # LogicalNotOp applied to a literal or !!
    [CS.LogicalNotOp, (inScope) ->
      switch
        when @expression.instanceof CS.Int, CS.Float, CS.String, CS.Bool
          (new Bool !@expression.data).g()
        when @expression.instanceof CS.Function, CS.BoundFunction then (new CS.Bool false).g()
        when @expression.instanceof CS.Null, CS.Undefined then (new CS.Bool true).g()
        when @expression.instanceof CS.ArrayInitialiser, CS.ObjectInitialiser
          if mayHaveSideEffects @expression, inScope then this
          else new CS.SeqOp (declarationsFor @expression), (new CS.Bool false).g()
        when @expression.instanceof CS.LogicalNotOp
          if @expression.expression.instanceof CS.LogicalNotOp then @expression.expression
          else this
        else this
    ]

    # typeof on any literal
    [CS.TypeofOp, ->
      switch
        when @expression.instanceof CS.Int, CS.Float, CS.UnaryNegateOp, CS.UnaryPlusOp
          (new String 'number').g()
        when @expression.instanceof CS.String then (new CS.String 'string').g()
        when @expression.instanceof CS.Function, CS.BoundFunction then (new CS.String 'function').g()
        when @expression.instanceof CS.Undefined then (new CS.String 'undefined').g()
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

  optimise: do ->

    walk = (fn, inScope = [], ancestry = []) ->
      if not this? or this is global
        throw new Error 'Optimiser rules must produce a node. `null` is not a node.'
      return this if this in ancestry
      ancestry.unshift this
      for childName in @childNodes
        child = @[childName]
        if child?
          if childName in @listMembers
            @[childName] = for member in child
              while member isnt walk.call (member = fn.call member, inScope, ancestry), fn, inScope, ancestry then
              inScope = union inScope, envEnrichments member
              member
          else
            while child isnt walk.call (child = fn.call child, inScope, ancestry), fn, inScope, ancestry then
            inScope = union inScope, envEnrichments child
            @[childName] = child
      do ancestry.shift
      fn.call this, inScope, ancestry

    (ast) ->
      rules = @rules
      walk.call ast, (inScope, ancestry) ->
        # not a fold for efficiency's sake
        memo = this
        for rule in rules[@className] ? []
          memo = rule.call memo, inScope, ancestry
        memo
