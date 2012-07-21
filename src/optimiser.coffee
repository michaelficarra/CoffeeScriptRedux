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

walk = do ->

  # TODO: DRY this!
  walk_ =
    ArrayInitialiser: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      @members = for member in @members
        continue while member isnt walk (member = fn.call member, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments member
        member
      ancestry.shift()
      fn.call this, inScope, ancestry
    Block: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      @statements = for statement in @statements
        continue while statement isnt walk (statement = fn.call statement, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments statement
        statement
      ancestry.shift()
      fn.call this, inScope, ancestry
    Function: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      @parameters = for param in @parameters
        continue while param isnt walk (param = fn.call param, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments param
        param
      if @block?
        continue while @block isnt walk (@block = fn.call @block, inScope, ancestry), fn, inScope, ancestry
      ancestry.shift()
      fn.call this, inScope, ancestry
    FunctionApplication: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      continue while @function isnt walk (@function = fn.call @function, inScope, ancestry), fn, inScope, ancestry
      inScope = union inScope, envEnrichments @function
      @arguments = for arg in @arguments
        continue while arg isnt walk (arg = fn.call arg, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments arg
        arg
      ancestry.shift()
      fn.call this, inScope, ancestry
    NewOp: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      continue while @constructor isnt walk (@constructor = fn.call @constructor, inScope, ancestry), fn, inScope, ancestry
      inScope = union inScope, envEnrichments @constructor
      @arguments = for arg in @arguments
        continue while arg isnt walk (arg = fn.call arg, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments arg
        arg
      ancestry.shift()
      fn.call this, inScope, ancestry
    ObjectInitialiser: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      @members = for member in @members
        continue while member isnt walk (member = fn.call member, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments member
        member
      ancestry.shift()
      fn.call this, inScope, ancestry
    Super: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      @arguments = for arg in @arguments
        continue while arg isnt walk (arg = fn.call arg, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments arg
        arg
      ancestry.shift()
      fn.call this, inScope, ancestry
    Switch: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      if @expression?
        continue while @expression isnt walk (@expression = fn.call @expression, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments @expression
      @cases = for case_ in @cases
        continue while case_ isnt walk (case_ = fn.call case_, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments case_
        case_
      if elseBlock?
        continue while @elseBlock isnt walk (@elseBlock = fn.call @elseBlock, inScope, ancestry), fn, inScope, ancestry
      ancestry.shift()
      fn.call this, inScope, ancestry
    SwitchCase: (fn, inScope = [], ancestry = []) ->
      return this if this in ancestry
      ancestry = [this, ancestry...]
      @conditions = for condition in @conditions
        continue while condition isnt walk (condition = fn.call condition, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments condition
        condition
      continue while @block isnt walk (@block = fn.call @block, inScope, ancestry), fn, inScope, ancestry
      ancestry.shift()
      fn.call this, inScope, ancestry


  walkDefault = (fn, inScope = [], ancestry = []) ->
    return this if this in ancestry
    ancestry = [this, ancestry...]
    for childName in @childNodes
      child = @[childName]
      if child?
        continue while child isnt walk (child = fn.call child, inScope, ancestry), fn, inScope, ancestry
        inScope = union inScope, envEnrichments child
        @[childName] = child
      child
    ancestry.shift()
    fn.call this, inScope, ancestry

  (node, args...) ->
    handlers = {}
    handlers[CS[key]::className] = val for own key, val of walk_
    handler =
      if Object::hasOwnProperty.call handlers, node.className
        handlers[node.className]
      else walkDefault
    handler.apply node, args


# TODO: better comments
# TODO: make sure I can't split any of these rules into sets of smaller rules

class exports.Optimiser

  # expose helpers so people have an easy time writing their own rules
  @isTruthy = isTruthy
  @isFalsey = isFalsey
  @mayHaveSideEffects = mayHaveSideEffects

  defaultRules = [

    [CS.Program, -> if @block? and mayHaveSideEffects @block, [] then this else new CS.Program null]

    # Turn the block into an expression
    [CS.Block, (inScope, ancestors) ->
      switch @statements.length
        when 0 then (new CS.Undefined).g()
        when 1 then @statements[0]
        else foldl1 @statements, (expr, s) ->
          new CS.SeqOp expr, s
    ]

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

    [CS.AssignOp, ->
      return this unless @expression.instanceof CS.SeqOp
      new CS.SeqOp @expression.left, new CS.AssignOp @assignee, @expression.right
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
      return this unless (@expression.instanceof CS.ArrayInitialiser) and @expression.members.length is 0
      retVal = if usedAsExpression this, ancestors then new CS.ArrayInitialiser [] else new CS.Undefined
      new CS.SeqOp (declarationsFor this), retVal.g()
    ]

    # for-own-of over empty object
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

    [CS.ExistsOp, -> if @left.instanceof CS.Null, CS.Undefined then @right else this]

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

  optimise: (ast) ->
    rules = @rules
    walk ast, (inScope, ancestry) ->
      # not a fold for efficiency's sake
      memo = this
      for rule in rules[@className] ? []
        memo = rule.call memo, inScope, ancestry
      memo
