{all, any, concat, concatMap, difference, foldl, foldl1, union} = require './functional-helpers'
{beingDeclared, declarationsFor, usedAsExpression, envEnrichments} = require './helpers'
CS = require './nodes'
exports = module?.exports ? this

makeDispatcher = (defaultValue, handlers, defaultHandler = (->)) ->
  handlers_ = {}
  for [ctors..., handler] in handlers
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
    [
      CS.ArrayInitialiser, CS.Class, CS.DeleteOp, CS.ForIn, CS.ForOf
      CS.Function, CS.BoundFunction, CS.HeregExp, CS.ObjectInitialiser, CS.Range
      CS.RegExp, CS.Slice, CS.TypeofOp, CS.While
      -> yes
    ]
    [CS.AssignOp, -> isTruthy @expression]
    [CS.Block, ->
      if @statements.length is 0 then no
      else isTruthy @statements[@statements.length - 1]
    ]
    [CS.Bool, CS.Float, CS.Int, CS.String, -> !!@data]
    [CS.Conditional, ->
      (isTruthy @condition) and (isTruthy @consequent) or
      (isFalsey @condition) and isTruthy @alternate
    ]
    [CS.LogicalAndOp, -> (isTruthy @left) and isTruthy @right]
    [CS.LogicalNotOp, -> isFalsey @expression]
    [CS.LogicalOrOp, -> (isTruthy @left) or isTruthy @right]
    [CS.Program, -> isTruthy @body]
    [CS.SeqOp, -> isTruthy @right]
    [CS.Switch, ->
      (all @cases, isTruthy) and
      if @alternate? then isTruthy @alternate else yes
    ]
    [CS.SwitchCase, -> isTruthy @consequent]
    [CS.UnaryExistsOp, ->
      (isTruthy @expression) or
      # TODO: comprehensive list of all possibly-falsey and always non-null expressions
      @expression.instanceof CS.Int, CS.Float, CS.String, CS.UnaryPlusOp, CS.UnaryNegateOp, CS.LogicalNotOp
    ]
  ], -> no

isFalsey =
  makeDispatcher no, [
    [CS.Null, CS.Undefined, -> yes]
    [CS.AssignOp, -> isFalsey @expression]
    [CS.Block, ->
      if @statements.length is 0 then yes
      else isFalsey @statements[@statements.length - 1]
    ]
    [CS.Bool, CS.Float, CS.Int, CS.String, -> not @data]
    [CS.Conditional, ->
      (isTruthy @condition) and (isFalsey @consequent) or
      (isFalsey @condition) and isFalsey @alternate
    ]
    [CS.LogicalAndOp, -> (isFalsey @left) or isFalsey @right]
    [CS.LogicalNotOp, -> isTruthy @expression]
    [CS.LogicalOrOp, -> (isFalsey @left) and isFalsey @right]
    [CS.Program, -> isFalsey @body]
    [CS.SeqOp, -> isFalsey @right]
    [CS.Switch, ->
      (all @cases, isFalsey) and
      if @alternate? then isFalsey @alternate else yes
    ]
    [CS.SwitchCase, -> isFalsey @block]
    [CS.UnaryExistsOp, -> @expression.instanceof CS.Null, CS.Undefined]
  ], -> no

mayHaveSideEffects =
  makeDispatcher no, [
    [
      CS.Function, CS.BoundFunction, CS.Null, CS.RegExp, CS.This, CS.Undefined
      -> no
    ]
    [
      CS.Break, CS.Continue, CS.Debugger, CS.DeleteOp, CS.NewOp, CS.Return, CS.Super
      CS.PreDecrementOp, CS.PreIncrementOp, CS.PostDecrementOp, CS.PostIncrementOp
      CS.ClassProtoAssignOp, CS.Constructor, CS.Throw, CS.JavaScript, CS.ExtendsOp
      -> yes
    ]
    [CS.Class, (inScope) ->
      (mayHaveSideEffects @parent, inScope) or
      @nameAssignee? and (@name or (beingDeclared @nameAssignee).length > 0)
    ]
    [CS.Conditional, (inScope) ->
      (mayHaveSideEffects @condition, inScope) or
      (not isFalsey @condition) and (mayHaveSideEffects @consequent, inScope) or
      (not isTruthy @condition) and mayHaveSideEffects @alternate, inScope
    ]
    [CS.DoOp, (inScope) ->
      return yes unless @expression.instanceof CS.Functions
      newScope = difference inScope, concatMap @expression.parameters, beingDeclared
      args = for p in @expression.parameters
        if p.instanceof CS.AssignOp then p.expression else p
      return yes if any args, (a) -> mayHaveSideEffects a, newScope
      mayHaveSideEffects @expression.body, newScope
    ]
    [CS.ExistsOp, (inScope) ->
      return yes if mayHaveSideEffects @left, inScope
      return no if @left.instanceof CS.Undefined, CS.Null
      mayHaveSideEffects @right, inScope
    ]
    [CS.FunctionApplication, CS.SoakedFunctionApplication, (inScope) ->
      return yes unless @function.instanceof CS.Function, CS.BoundFunction
      newScope = difference inScope, concatMap @function.parameters, beingDeclared
      return yes if any @arguments, (a) -> mayHaveSideEffects a, newScope
      mayHaveSideEffects @function.body, newScope
    ]
    [CS.LogicalAndOp, (inScope) ->
      return yes if mayHaveSideEffects @left, inScope
      return no if isFalsey @left
      mayHaveSideEffects @right, inScope
    ]
    [CS.LogicalOrOp, (inScope) ->
      return yes if mayHaveSideEffects @left, inScope
      return no if isTruthy @left
      mayHaveSideEffects @right, inScope
    ]
    [CS.While, (inScope) ->
      (mayHaveSideEffects @condition, inScope) or
      (not isFalsey @condition) and mayHaveSideEffects @body, inScope
    ]
    # category: AssignOp
    [CS.AssignOp, CS.ClassProtoAssignOp, CS.CompoundAssignOp, (inScope) ->
      #(mayHaveSideEffects @expression, inScope) or (beingDeclared @assignee).length > 0
      yes
    ]
    # category: Primitive
    [CS.Bool, CS.Float, CS.Identifier, CS.Int, CS.String, -> no]
  ], (inScope) ->
    any @childNodes, (child) =>
      if child in @listMembers
      then any this[child], (m) -> mayHaveSideEffects m, inScope
      else mayHaveSideEffects this[child], inScope



class exports.Optimiser

  @optimise = => (new this).optimise arguments...

  # expose helpers so people have an easy time writing their own rules
  @isTruthy = isTruthy
  @isFalsey = isFalsey
  @mayHaveSideEffects = mayHaveSideEffects

  defaultRules = [

    # If a program has no side effects, then it is the empty program
    [CS.Program, ->
      if !@body? or mayHaveSideEffects @body, [] then this
      else new CS.Program null
    ]

    # Turn blocks into expressions
    [CS.Block, ({inScope}) ->
      switch @statements.length
        when 0 then (new CS.Undefined).g()
        when 1 then @statements[0]
        else
          foldl @statements[0], @statements[1..], (expr, s) ->
            new CS.SeqOp expr, s
    ]

    # Reject unused and inconsequential expressions
    # TODO: comments
    [CS.SeqOp, ({inScope, ancestry}) ->
      canDropLast = not usedAsExpression this, ancestry
      if @left.instanceof CS.Undefined then @right
      else if @left.instanceof CS.Return, CS.Throw then @left
      else if mayHaveSideEffects @left, inScope
        if mayHaveSideEffects @right, inScope then this
        else if not canDropLast then this
        else if @right.instanceof CS.Undefined then @left
        else new CS.SeqOp @left, declarationsFor @right, union inScope, envEnrichments @left, inScope
      else if (@right.instanceof CS.Identifier) and @right.data is 'eval' and
      ((ancestry[0]?.instanceof CS.FunctionApplication) and ancestry[0].function is this or
      (ancestry[0]?.instanceof CS.DoOp) and ancestry[0].expression is this)
        if (@left.instanceof CS.Int) and 0 <= @left.data <= 9 then this
        else if mayHaveSideEffects @left, inScope then this
        else new CS.SeqOp (new CS.Int 0).g(), @right
      else if mayHaveSideEffects @right, inScope
        new CS.SeqOp (declarationsFor @left, inScope), @right
      else if canDropLast
        declarationsFor this, inScope
      else @right
    ]

    # Push assignments through sequences
    [CS.AssignOp, ->
      return this unless @expression.instanceof CS.SeqOp
      new CS.SeqOp @expression.left, new CS.AssignOp @assignee, @expression.right
    ]

    # A falsey condition with side effects -> (the condition; [])
    # A falsey condition without side effects -> []
    # A truthy condition without side effects -> a loop
    [CS.While, ({inScope}) ->
      if isFalsey @condition
        new CS.Block [
          if mayHaveSideEffects @condition, inScope
            new CS.SeqOp @condition, declarationsFor @body
          else
            if @body? then declarationsFor @body, inScope else new CS.Undefined
          new CS.ArrayInitialiser []
        ]
      else if isTruthy @condition
        if mayHaveSideEffects @condition, inScope then this
        else if @body?
          if this instanceof CS.Loop then this else (new CS.Loop @body).g()
        else new CS.ArrayInitialiser []
      else this
    ]

    # Produce the consequent when the condition is truthy
    # Produce the alternative when the condition is falsey
    # Prepend the condition if it has side effects
    [CS.Conditional, ({inScope}) ->
      if isFalsey @condition
        [removedBlock, block] = [@consequent, @alternate]
      else if isTruthy @condition
        [block, removedBlock] = [@consequent, @alternate]
      else
        return this
      decls = declarationsFor removedBlock, inScope
      block = if block? then new CS.SeqOp decls, block else decls
      if mayHaveSideEffects @condition, inScope
        block = new CS.SeqOp @condition, block
      block
    ]

    # for-in over an empty list produces an empty list
    [CS.ForIn, ({inScope}) ->
      return this unless (@target.instanceof CS.ArrayInitialiser) and @target.members.length is 0
      new CS.SeqOp (declarationsFor this, inScope), (new CS.ArrayInitialiser []).g()
    ]

    # for-own-of over empty object produces an empty list
    [CS.ForOf, ({inScope}) ->
      return this unless @isOwn and (@target.instanceof CS.ObjectInitialiser) and @target.members.length is 0
      new CS.SeqOp (declarationsFor this, inScope), (new CS.ArrayInitialiser []).g()
    ]

    # for-in or for-of with falsey filter
    [CS.ForIn, CS.ForOf, ({inScope}) ->
      return this unless isFalsey @filter
      new CS.SeqOp (declarationsFor this, inScope), (new CS.ArrayInitialiser []).g()
    ]

    # for-in or for-of with truthy filter
    [CS.ForIn, ->
      return this unless isTruthy @filter
      new CS.ForIn @valAssignee, @keyAssignee, @target, @step, null, @body
    ]
    [CS.ForOf, ->
      return this unless isTruthy @filter
      new CS.ForOf @isOwn, @keyAssignee, @valAssignee, @target, null, @body
    ]

    # Arrays in statement position might as well be Seqs
    [CS.ArrayInitialiser, ({inScope, ancestry}) ->
      if usedAsExpression this, ancestry then this
      else
        foldl (new CS.Undefined).g(), @members, (expr, m) ->
          new CS.SeqOp expr, m
    ]

    # Produce the right operand when the left operand is null or undefined
    [CS.ExistsOp, -> if @left.instanceof CS.Null, CS.Undefined then @right else this]

    # Produce false when the expression is null or undefined
    [CS.UnaryExistsOp, -> if @expression.instanceof CS.Null, CS.Undefined then (new CS.Bool false).g() else this]

    # LogicalNotOp applied to a literal or !!
    [CS.LogicalNotOp, ({inScope}) ->
      switch
        when @expression.instanceof CS.Int, CS.Float, CS.String, CS.Bool
          (new CS.Bool !@expression.data).g()
        when @expression.instanceof CS.Functions then (new CS.Bool false).g()
        when @expression.instanceof CS.Null, CS.Undefined then (new CS.Bool true).g()
        when @expression.instanceof CS.ArrayInitialiser, CS.ObjectInitialiser
          if mayHaveSideEffects @expression, inScope then this
          else new CS.SeqOp (declarationsFor @expression, inScope), (new CS.Bool false).g()
        when @expression.instanceof CS.LogicalNotOp
          if @expression.expression.instanceof CS.LogicalNotOp then @expression.expression
          else this
        else this
    ]

    # typeof on any literal
    [CS.TypeofOp, ->
      switch
        when @expression.instanceof CS.Int, CS.Float, CS.UnaryNegateOp, CS.UnaryPlusOp
          (new CS.String 'number').g()
        when @expression.instanceof CS.String then (new CS.String 'string').g()
        when @expression.instanceof CS.Functions then (new CS.String 'function').g()
        when @expression.instanceof CS.Undefined then (new CS.String 'undefined').g()
        # TODO: comprehensive
        else this
    ]

    # simplify trailing `return`/`undefined` in function bodies
    [CS.SeqOp, ({ancestry}) ->
      return this unless (ancestry[0]?.instanceof CS.Functions) and ancestry[0].body is this
      if (@right.instanceof CS.Return) and @right.expression?
        new CS.SeqOp @left, @right.expression
      else if @right.instanceof CS.Undefined
        new CS.SeqOp @left, new CS.Return
      else this
    ]

    # get rid of function bodies that are simply `return` or `undefined`
    [CS.Function, CS.BoundFunction, ->
      return this unless @block? and (
        (@block.instanceof CS.Undefined) or
        (@block.instanceof CS.Return) and not @block.expression?
      )
      new @constructor @parameters, null
    ]

    # `return undefined` -> `return`, everywhere
    [CS.Return, -> if @expression?.instanceof CS.Undefined then new CS.Return else this]

    [CS.Slice, ->
      if (@left?.instanceof CS.Int, CS.String) and +@left.data is 0
        new CS.Slice @expression, @isInclusive, null, @right
      else if @isInclusive and (@right?.instanceof CS.UnaryNegateOp) and (@right.expression.instanceof CS.Int) and @right.expression.data is 1
        new CS.Slice @expression, yes, @left, null
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
    this

  optimise: do ->

    walk = (fn, inScope = [], ancestry = []) ->
      ancestry.unshift this
      for childName in @childNodes when this[childName]?
        if childName in @listMembers
          for member, n in this[childName]
            while this[childName][n] isnt walk.call (this[childName][n] = fn.call this[childName][n], {inScope, ancestry}), fn, inScope, ancestry then
            inScope = union inScope, envEnrichments this[childName][n], inScope
        else
          while this[childName] isnt walk.call (this[childName] = fn.call this[childName], {inScope, ancestry}), fn, inScope, ancestry then
          inScope = union inScope, envEnrichments this[childName], inScope
      do ancestry.shift
      replacementNode = fn.call this, {inScope, ancestry}
      if this isnt replacementNode
        while replacementNode isnt walk.call (replacementNode = fn.call replacementNode, {inScope, ancestry}), fn, inScope, ancestry then
        replacementNode[p] = this[p] for p in ['raw', 'line', 'column', 'offset']
      replacementNode

    (ast) ->
      rules = @rules
      walk.call ast, ({ancestry}) ->
        if not this? or this is global
          throw new Error 'Optimiser rules must produce a node. `null` is not a node.'
        return this if this in ancestry
        # not a fold for efficiency's sake
        memo = this
        for rule in rules[memo.className] ? []
          memo = rule.apply memo, arguments
          break if memo isnt this
        memo
