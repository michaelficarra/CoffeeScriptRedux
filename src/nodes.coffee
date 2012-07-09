{YES, NO, any, foldl, map, concatMap, difference, union} = require './helpers'

# these are the identifiers that need to be declared when the given value is
# being used as the target of an assignment
beingDeclared = (assignment) ->
  switch assignment.className
    when 'Identifier' then [assignment]
    when 'AssignOp' then beingDeclared assignment.assignee
    when 'ArrayInitialiser' then concatMap assignment.members, beingDeclared
    when 'ObjectInitialiser' then concatMap assignment.vals(), beingDeclared
    else throw new Error "beingDeclared: Non-exhaustive patterns in case: #{assignment.className}"

# TODO: DRY `walk` methods
# TODO: change `walk` to act more like a fold? it's more generic than a map


class @Node
  generated: no
  toJSON: -> nodeType: @className
  isTruthy: NO
  isFalsey: NO
  childNodes: [] # children's names; in evaluation order where applicable
  envEnrichments: -> # environment enrichments that occur when this node is evaluated
    concatMap @childNodes, (child) -> @[child].envEnrichments()
  mayHaveSideEffects: (inScope) ->
    any @childNodes, (child) -> child?.mayHaveSideEffects inScope
  #fmap: (memo, fn) ->
  #  memo = fn memo, this
  #  for child in @childNodes
  #    memo = @[child].fmap memo, fn
  #  memo
  #fmap: (memo, fn) ->
  #  for child in @childNodes
  #    memo = @[child].fmap memo, fn
  #  fn memo, this
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    for childName in @childNodes
      child = @[childName]
      continue while child isnt (child = (fn.call child, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, child.envEnrichments()
      @[childName] = child
    this
  r: (@raw) -> this
  p: (@line, @column) -> this
  g: ->
    @generated = yes
    this

class AssignOp extends @Node
  constructor: -> # jashkenas/coffee-script#2359
  childNodes: ['expr']
  mayHaveSideEffects: (inScope) ->
    (@expr.mayHaveSideEffects inScope) or any (beingDeclared @assignee), (v) -> v in inScope
  toJSON: ->
    nodeType: @className
    assignee: @assignee.toJSON()
    expression: @expr.toJSON()

class BinOp extends @Node
  constructor: -> # jashkenas/coffee-script#2359
  childNodes: ['left', 'right']
  toJSON: ->
    nodeType: @className
    left: @left.toJSON()
    right: @right.toJSON()

class Primitive extends @Node
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: NO
  toJSON: ->
    nodeType: @className
    data: @data

# things that are *structurally* similar to statements
class Statement extends @Node
  constructor: -> # jashkenas/coffee-script#2359

# things that are *structurally* similar to unary operators
class UnaryOp extends @Node
  constructor: -> # jashkenas/coffee-script#2359
  childNodes: ['expr']
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()


# ArrayInitialiser :: [ArrayInitialiserMembers] -> ArrayInitialiser
class @ArrayInitialiser extends @Node
  className: 'ArrayInitialiser'
  constructor: (@members) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    @members = for member in @members
      continue while member isnt (member = (fn.call member, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, member.envEnrichments()
      member
    this
  isTruthy: YES
  envEnrichments: -> concatMap @members, (member) -> member.envEnrichments()
  mayHaveSideEffects: (inScope) -> any @members, (m) -> m.mayHaveSideEffects inScope
  toJSON: ->
    nodeType: @className
    members: (m.toJSON() for m in @members)

# AssignOp :: Assignables -> Exprs -> AssignOp
class @AssignOp extends AssignOp
  className: 'AssignOp'
  constructor: (@assignee, @expr) ->
  isTruthy: -> @expr.isTruthy()
  isFalsey: -> @expr.isFalsey()
  envEnrichments: -> beingDeclared @assignee

# BitAndOp :: Exprs -> Exprs -> BitAndOp
class @BitAndOp extends BinOp
  className: 'BitAndOp'
  constructor: (@left, @right) ->

# BitNotOp :: Exprs -> BitNotOp
class @BitNotOp extends UnaryOp
  className: 'BitNotOp'
  constructor: (@expr) ->

# BitOrOp :: Exprs -> Exprs -> BitOrOp
class @BitOrOp extends BinOp
  className: 'BitOrOp'
  constructor: (@left, @right) ->

# BitXorOp :: Exprs -> Exprs -> BitXorOp
class @BitXorOp extends BinOp
  className: 'BitXorOp'
  constructor: (@left, @right) ->

# Block :: [Statement] -> Block
Block = class @Block extends @Node
  className: 'Block'
  constructor: (@statements) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    @statements = for statement in @statements
      continue while statement isnt (statement = (fn.call statement, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, statement.envEnrichments()
      statement
    this
  @wrap = (s) -> new Block([s]).r(s.raw).p(s.line, s.column)
  # TODO: isTruthy and isFalsey must check the last expression and also any
  # early returns, no matter how deeply nested in conditionals
  mayHaveSideEffects: (inScope) ->
    any @statements, (s) -> s.mayHaveSideEffects inScope
  toJSON: ->
    nodeType: @className
    statements: (s.toJSON() for s in @statements)

# Bool :: bool -> Bool
Bool = class @Bool extends Primitive
  className: 'Bool'
  constructor: (@data) ->
  isTruthy: -> !!@data
  isFalsey: -> not @data

# Break :: Break
class @Break extends Statement
  className: 'Break'
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: NO

# class @:: Maybe Assignable -> Maybe Exprs -> Maybe Block -> Class
class @Class extends @Node
  className: 'Class'
  constructor: (@nameAssignment, @parent, @block) ->
    @name =
      if @nameAssignment?
        # poor man's pattern matching
        switch @nameAssignment.className
          when 'Identifier'
            @nameAssignment.data
          when 'MemberAccessOp', 'ProtoMemberAccessOp', 'SoakedMemberAccessOp', 'SoakedProtoMemberAccessOp'
            @nameAssignment.memberName
          else null
      else null
  childNodes: ['parent', 'block']
  isTruthy: YES
  mayHaveSideEffects: (inScope) ->
    (super inScope) or
    @nameAssignment? and any (beingDeclared @nameAssignment), (v) -> v in inScope
  toJSON: ->
    nodeType: @className
    nameAssignment: @nameAssignment?.toJSON()
    name: @name
    parent: @parent?.toJSON()
    block: @block?.toJSON()

# ClassProtoAssignOp :: ObjectInitialiserKeys -> Exprs -> ClassProtoAssignOp
class @ClassProtoAssignOp extends AssignOp
  className: 'ClassProtoAssignOp'
  constructor: (@assignee, @expr) ->
  mayHaveSideEffects: NO

# CompoundAssignOp :: CompoundAssignableOps -> Assignables -> Exprs -> CompoundAssignOp
class @CompoundAssignOp extends AssignOp
  className: 'CompoundAssignOp'
  constructor: (@op, @assignee, @expr) ->
  toJSON: ->
    nodeType: @className
    op: @op::className
    assignee: @assignee.toJSON()
    expression: @expr.toJSON()

# Note: A tree of ConcatOp represents interpolation
# ConcatOp :: Exprs -> Exprs -> ConcatOp
class @ConcatOp extends BinOp
  className: 'ConcatOp'
  constructor: (@left, @right) ->

# Conditional :: Exprs -> Maybe Block -> Maybe Block -> Conditional
class @Conditional extends @Node
  className: 'Conditional'
  childNodes: ['condition', 'block', 'elseBlock']
  isTruthy: ->
    !!(@condition.isTruthy() and @block?.isTruthy() or
    @condition.isFalsey() and @elseBlock?.isTruthy())
  isFalsey: ->
    !!(@condition.isTruthy() and @block?.isFalsey() or
    @condition.isFalsey() and @elseBlock?.isFalsey())
  mayHaveSideEffects: (inScope) ->
    # TODO: only check each respective block if the condition would allow execution to get there
    !!((@condition.mayHaveSideEffects inScope) or
    (not @condition.isFalsey() and @block?.mayHaveSideEffects inScope) or
    (not @condition.isTruthy() and @elseBlock?.mayHaveSideEffects inScope))
  constructor: (@condition, @block, @elseBlock) ->
  toJSON: ->
    nodeType: @className
    condition: @condition.toJSON()
    block: @block?.toJSON()
    elseBlock: @elseBlock?.toJSON()

# Note: This only represents the original syntactic specification as an
# "unless". The node should be treated in all other ways as a Conditional.
# NegatedConditional :: Exprs -> Block -> Maybe Block -> NegatedConditional
class @NegatedConditional extends @Conditional
  constructor: (@condition, @block, @elseBlock) ->

# Continue :: Continue
class @Continue extends Statement
  className: 'Continue'
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: NO

# DeleteOp :: MemberAccessOps -> DeleteOp
class @DeleteOp extends UnaryOp
  className: 'DeleteOp'
  constructor: (@expr) ->
  isTruthy: YES
  mayHaveSideEffects: YES

# DivideOp :: Exprs -> Exprs -> DivideOp
class @DivideOp extends BinOp
  className: 'DivideOp'
  constructor: (@left, @right) ->

# DoOp :: Exprs -> DoOp
class @DoOp extends UnaryOp
  className: 'DoOp'
  constructor: (@expr) ->
  mayHaveSideEffects: (inScope) ->
    return yes unless @expr.className in ['Function', 'BoundFunction']
    newScope = difference inScope, concatMap @expr.parameters, beingDeclared
    args = for p in @expr.parameters
      if p.className is 'AssignOp' then p.expr else p
    return yes if any args, (a) => a.mayHaveSideEffects newScope
    @expr.mayHaveSideEffects newScope

# DynamicMemberAccessOp :: Exprs -> Exprs -> DynamicMemberAccessOp
class @DynamicMemberAccessOp extends @Node
  className: 'DynamicMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->
  childNodes: ['expr', 'indexingExpr']
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    indexingExpression: @indexingExpr.toJSON()

# DynamicProtoMemberAccessOp :: Exprs -> Exprs -> DynamicProtoMemberAccessOp
class @DynamicProtoMemberAccessOp extends @DynamicMemberAccessOp
  className: 'DynamicProtoMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->

# SoakedDynamicMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicMemberAccessOp
class @SoakedDynamicMemberAccessOp extends @DynamicMemberAccessOp
  className: 'SoakedDynamicMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->

# SoakedDynamicProtoMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicProtoMemberAccessOp
class @SoakedDynamicProtoMemberAccessOp extends @DynamicMemberAccessOp
  className: 'SoakedDynamicProtoMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->

# EQOp :: Exprs -> Exprs -> EQOp
class @EQOp extends BinOp
  className: 'EQOp'
  constructor: (@left, @right) ->

# ExistsAssignOp :: Assignables -> Exprs -> ExistsAssignOp
class @ExistsAssignOp extends AssignOp
  className: 'ExistsAssignOp'
  constructor: (@assignee, @expr) ->

# ExistsOp :: Exprs -> Exprs -> ExistsOp
class @ExistsOp extends BinOp
  className: 'ExistsOp'
  constructor: (@left, @right) ->
  # TODO: override BinOp::mayHaveSideEffects, respecting short-circuiting behaviour

# ExtendsOp :: Exprs -> Exprs -> ExtendsOp
class @ExtendsOp extends BinOp
  className: 'ExtendsOp'
  constructor: (@left, @right) ->

# Float :: float -> Float
class @Float extends Primitive
  className: 'Float'
  constructor: (@data) ->
  isTruthy: -> !!@data
  isFalsey: -> not @data

# ForIn :: Assignable -> Maybe Assignable -> Exprs -> Exprs -> Maybe Exprs -> Block -> ForIn
class @ForIn extends @Node
  className: 'ForIn'
  constructor: (@valAssignee, @keyAssignee, @expr, @step, @filterExpr, @block) ->
  childNodes: ['valAssignee', 'keyAssignee', 'expr', 'step', 'filterExpr', 'block']
  isTruthy: YES
  mayHaveSideEffects: YES # TODO: actual logic
  toJSON: ->
    nodeType: @className
    valAssignee: @valAssignee.toJSON()
    keyAssignee: @keyAssignee?.toJSON()
    expression: @expr.toJSON()
    step: @step.toJSON()
    filterExpression: @filterExpr?.toJSON()
    block: @block.toJSON()

# ForOf :: bool -> Assignable -> Maybe Assignable -> Exprs -> Maybe Exprs -> Block -> ForOf
class @ForOf extends @Node
  className: 'ForOf'
  constructor: (@isOwn, @keyAssignee, @valAssignee, @expr, @filterExpr, @block) ->
  childNodes: ['keyAssignee', 'valAssignee', 'expr', 'filterExpr', 'block']
  isTruthy: YES
  mayHaveSideEffects: YES # TODO: actual logic
  toJSON: ->
    nodeType: @className
    isOwn: @isOwn
    keyAssignee: @keyAssignee.toJSON()
    valAssignee: @valAssignee?.toJSON()
    expression: @expr.toJSON()
    filterExpression: @filterExpr?.toJSON()
    block: @block.toJSON()

# Function :: [Parameters] -> Maybe Block -> Function
class @Function extends @Node
  className: 'Function'
  constructor: (@parameters, @block) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    @parameters = for param in @parameters
      continue while param isnt (param = (fn.call param, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, param.envEnrichments()
      param
    continue while @block isnt (@block = (fn.call @block, newScope, ancestry).walk fn, inScope, ancestry)
    this
  isTruthy: YES
  mayHaveSideEffects: NO
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block?.toJSON()

# BoundFunction :: [Parameters] -> Block -> BoundFunction
class @BoundFunction extends @Function
  className: 'BoundFunction'
  constructor: (@parameters, @block) ->

# FunctionApplication :: Exprs -> [Arguments] -> FunctionApplication
class @FunctionApplication extends @Node
  className: 'FunctionApplication'
  constructor: (@function, @arguments) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    continue while @function isnt (@function = (fn.call @function, inScope, ancestry).walk fn, inScope, ancestry)
    inScope = union inScope, @function.envEnrichments()
    @arguments = for arg in @arguments
      continue while arg isnt (arg = (fn.call arg, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, arg.envEnrichments()
      arg
    this
  mayHaveSideEffects: (inScope) ->
    return yes unless @function.className in ['Function', 'BoundFunction']
    newScope = difference inScope, concatMap @function.parameters, beingDeclared
    return yes if any @arguments, (a) => a.mayHaveSideEffects newScope
    @function.block.mayHaveSideEffects newScope
  toJSON: ->
    nodeType: @className
    function: @function.toJSON()
    arguments: (a.toJSON() for a in @arguments)

# SoakedFunctionApplication :: Exprs -> [Arguments] -> SoakedFunctionApplication
class @SoakedFunctionApplication extends @FunctionApplication
  className: 'SoakedFunctionApplication'
  constructor: (@function, @arguments) ->

# GTEOp :: Exprs -> Exprs -> GTEOp
class @GTEOp extends BinOp
  className: 'GTEOp'
  constructor: (@left, @right) ->

# GTOp :: Exprs -> Exprs -> GTOp
class @GTOp extends BinOp
  className: 'GTOp'
  constructor: (@left, @right) ->

# HeregExp :: Exprs -> [string] -> HeregExp
class @HeregExp extends @Node
  className: 'HeregExp'
  constructor: (@expr, flags) ->
    @flags = {}
    for flag in ['g', 'i', 'm', 'y']
      @flags[flag] = flag in flags
  childNodes: ['expr']
  isTruthy: YES
  toJSON: ->
    nodeType: @className
    expression: @expr
    flags: @flags

# Identifier :: string -> Identifier
class @Identifier extends Primitive
  className: 'Identifier'
  constructor: (@data) ->

# InOp :: Exprs -> Exprs -> InOp
class @InOp extends BinOp
  className: 'InOp'
  constructor: (@left, @right) ->

# InstanceofOp :: Exprs -> Exprs -> InstanceofOp
class @InstanceofOp extends BinOp
  className: 'InstanceofOp'
  constructor: (@left, @right) ->

# Int :: float -> Int
class @Int extends Primitive
  className: 'Int'
  constructor: (@data) ->
  isTruthy: -> !!@data
  isFalsey: -> not @data

# JavaScript :: string -> JavaScript
class @JavaScript extends Primitive
  className: 'JavaScript'
  mayHaveSideEffects: YES
  constructor: (@data) ->

# LTEOp :: Exprs -> Exprs -> LTEOp
class @LTEOp extends BinOp
  className: 'LTEOp'
  constructor: (@left, @right) ->

# LTOp :: Exprs -> Exprs -> LTOp
class @LTOp extends BinOp
  className: 'LTOp'
  constructor: (@left, @right) ->

# LeftShiftOp :: Exprs -> Exprs -> LeftShiftOp
class @LeftShiftOp extends BinOp
  className: 'LeftShiftOp'
  constructor: (@left, @right) ->

# LogicalAndOp :: Exprs -> Exprs -> LogicalAndOp
class @LogicalAndOp extends BinOp
  className: 'LogicalAndOp'
  isTruthy: -> @left.isTruthy() and @right.isTruthy()
  isFalsey: -> @left.isFalsey() or @right.isFalsey()
  constructor: (@left, @right) ->
  # TODO: override BinOp::mayHaveSideEffects, respecting short-circuiting behaviour

# LogicalNotOp :: Exprs -> LogicalNotOp
class @LogicalNotOp extends UnaryOp
  className: 'LogicalNotOp'
  constructor: (@expr) ->
  isTruthy: -> @expr.isFalsey()
  isFalsey: -> @expr.isTruthy()

# LogicalOrOp :: Exprs -> Exprs -> LogicalOrOp
class @LogicalOrOp extends BinOp
  className: 'LogicalOrOp'
  constructor: (@left, @right) ->
  isTruthy: -> @left.isTruthy() or @right.isTruthy()
  isFalsey: -> @left.isFalsey() and @right.isFalsey()
  # TODO: override BinOp::mayHaveSideEffects, respecting short-circuiting behaviour

# MemberAccessOp :: Exprs -> MemberNames -> MemberAccessOp
class @MemberAccessOp extends @Node
  className: 'MemberAccessOp'
  constructor: (@expr, @memberName) ->
  childNodes: ['expr']
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    memberName: @memberName

# ProtoMemberAccessOp :: Exprs -> MemberNames -> ProtoMemberAccessOp
class @ProtoMemberAccessOp extends @MemberAccessOp
  className: 'ProtoMemberAccessOp'
  constructor: (@expr, @memberName) ->

# SoakedMemberAccessOp :: Exprs -> MemberNames -> SoakedMemberAccessOp
class @SoakedMemberAccessOp extends @MemberAccessOp
  className: 'SoakedMemberAccessOp'
  constructor: (@expr, @memberName) ->

# SoakedProtoMemberAccessOp :: Exprs -> MemberNames -> SoakedProtoMemberAccessOp
class @SoakedProtoMemberAccessOp extends @MemberAccessOp
  className: 'SoakedProtoMemberAccessOp'
  constructor: (@expr, @memberName) ->

# MultiplyOp :: Exprs -> Exprs -> MultiplyOp
class @MultiplyOp extends BinOp
  className: 'MultiplyOp'
  constructor: (@left, @right) ->

# NEQOp :: Exprs -> Exprs -> NEQOp
class @NEQOp extends BinOp
  className: 'NEQOp'
  constructor: (@left, @right) ->

# NewOp :: Exprs -> [Arguments] -> NewOp
class @NewOp extends @Node
  className: 'NewOp'
  constructor: (@ctor, @arguments) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    continue while @ctor isnt (@ctor = (fn.call @ctor, inScope, ancestry).walk fn, inScope, ancestry)
    inScope = union inScope, @ctor.envEnrichments()
    @arguments = for arg in @arguments
      continue while arg isnt (arg = (fn.call arg, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, arg.envEnrichments()
      arg
    this
  mayHaveSideEffects: YES
  toJSON: ->
    nodeType: @className
    constructor: @ctor.toJSON()
    arguments: (a.toJSON() for a in @arguments)

# Null :: Null
class @Null extends Statement
  className: 'Null'
  constructor: -> # jashkenas/coffee-script#2359
  isFalsey: YES
  mayHaveSideEffects: NO

# ObjectInitialiser :: [(ObjectInitialiserKeys, Exprs)] -> ObjectInitialiser
class @ObjectInitialiser extends @Node
  className: 'ObjectInitialiser'
  constructor: (@members) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    @members = for [key, val] in @members
      continue while val isnt (val = (fn.call val, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, val.envEnrichments()
      [key, val]
    this
  isTruthy: YES
  mayHaveSideEffects: (inScope) ->
    any @members, ([key, expr]) ->
      (key.mayHaveSideEffects inScope) or expr.mayHaveSideEffects inScope
  keys: -> map @members ([key, val]) -> key
  vals: -> map @members ([key, val]) -> val
  toJSON: ->
    nodeType: @className
    members: for [key, expr] in @members
      [key.toJSON(), expr.toJSON()]

# OfOp :: Exprs -> Exprs -> OfOp
class @OfOp extends BinOp
  className: 'OfOp'
  constructor: (@left, @right) ->

# PlusOp :: Exprs -> Exprs -> PlusOp
class @PlusOp extends BinOp
  className: 'PlusOp'
  constructor: (@left, @right) ->

# PreDecrementOp :: Exprs -> PreDecrementOp
class @PreDecrementOp extends UnaryOp
  className: 'PreDecrementOp'
  constructor: (@expr) ->
  mayHaveSideEffects: YES

# PreIncrementOp :: Exprs -> PreIncrementOp
class @PreIncrementOp extends UnaryOp
  className: 'PreIncrementOp'
  constructor: (@expr) ->
  mayHaveSideEffects: YES

# PostDecrementOp :: Exprs -> PostDecrementOp
class @PostDecrementOp extends UnaryOp
  className: 'PostDecrementOp'
  constructor: (@expr) ->
  mayHaveSideEffects: YES

# PostIncrementOp :: Exprs -> PostIncrementOp
class @PostIncrementOp extends UnaryOp
  className: 'PostIncrementOp'
  constructor: (@expr) ->
  mayHaveSideEffects: YES

# Program :: Maybe Block -> Program
class @Program extends @Node
  className: 'Program'
  constructor: (@block) ->
  childNodes: ['block']
  isTruthy: -> !!@block?.isTruthy()
  isFalsey: -> !!@block?.isFalsey()
  toJSON: ->
    nodeType: @className
    block: @block?.toJSON()

# TODO: Range extends BinOp
# Range :: bool -> Exprs -> Exprs -> Range
class @Range extends @Node
  className: 'Range'
  constructor: (@isInclusive, @left, @right) ->
  childNodes: BinOp::childNodes
  isTruthy: YES
  mayHaveSideEffects: BinOp::mayHaveSideEffects
  toJSON: ->
    nodeType: @className
    isInclusive: @isInclusive
    left: @left.toJSON()
    right: @right.toJSON()

# RegExp :: string -> [string] -> RegExp
class @RegExp extends @Node
  className: 'RegExp'
  constructor: (@data, flags) ->
    @flags = {}
    for flag in ['g', 'i', 'm', 'y']
      @flags[flag] = flag in flags
  isTruthy: YES
  mayHaveSideEffects: NO
  toJSON: ->
    nodeType: @className
    data: @data
    flags: @flags

# RemOp :: Exprs -> Exprs -> RemOp
class @RemOp extends BinOp
  className: 'RemOp'
  constructor: (@left, @right) ->

# Rest :: Exprs -> Rest
class @Rest extends UnaryOp
  className: 'Rest'
  constructor: (@expr) ->

# Return :: Exprs -> Return
class @Return extends UnaryOp
  className: 'Return'
  constructor: (@expr) ->

# SeqOp :: Exprs -> Exprs -> SeqOp
class @SeqOp extends BinOp
  className: 'SeqOp'
  constructor: (@left, @right) ->
  isTruthy: -> @right.isTruthy()
  isFalsey: -> @right.isFalsey()

# SignedRightShiftOp :: Exprs -> Exprs -> SignedRightShiftOp
class @SignedRightShiftOp extends BinOp
  className: 'SignedRightShiftOp'
  constructor: (@left, @right) ->

# Slice :: Exprs -> bool -> Maybe Exprs -> Maybe Exprs -> Slice
class @Slice extends @Node
  className: 'Slice'
  constructor: (@expr, @isInclusive, @left, @right) ->
  childNodes: ['expr', 'left', 'right']
  isTruthy: YES
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    isInclusive: @isInclusive
    left: @left?.toJSON()
    right: @right?.toJSON()

# Spread :: Exprs -> Spread
class @Spread extends UnaryOp
  className: 'Spread'
  constructor: (@expr) ->

# String :: string -> String
class @String extends Primitive
  className: 'String'
  constructor: (@data) ->
  isTruthy: -> !!@data
  isFalsey: -> not @data

# SubtractOp :: Exprs -> Exprs -> SubtractOp
class @SubtractOp extends BinOp
  className: 'SubtractOp'
  constructor: (@left, @right) ->

# Super :: [Arguments] -> Super
class @Super extends @Node
  className: 'Super'
  constructor: (@arguments) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    @arguments = for arg in @arguments
      continue while arg isnt (arg = (fn.call arg, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, arg.envEnrichments()
      arg
    this
  mayHaveSideEffects: YES
  toJSON: ->
    nodeType: @className
    arguments: (a.toJSON() for a in @arguments)

# Switch :: Maybe Exprs -> [([Exprs], Block)] -> Maybe Block -> Switch
class @Switch extends @Node
  className: 'Switch'
  constructor: (@expr, @cases, @elseBlock) ->
  walk: (fn, inScope = [], ancestry = []) ->
    # TODO: cycle test
    ancestry.push this
    if @expr?
      continue while @expr isnt (@expr = (fn.call @expr, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, @expr.envEnrichments()
    @cases = for [conds, block] in @cases
      conds = for cond in conds
        continue while cond isnt (cond = (fn.call cond, inScope, ancestry).walk fn, inScope, ancestry)
        inScope = union inScope, cond.envEnrichments()
      continue while block isnt (block = (fn.call block, inScope, ancestry).walk fn, inScope, ancestry)
      inScope = union inScope, block.envEnrichments()
      [conds, block]
    if elseBlock?
      continue while @elseBlock isnt (@elseBlock = (fn.call @elseBlock, inScope, ancestry).walk fn, inScope, ancestry)
    this
  # TODO: isTruthy/isFalsey: all blocks are truthy/falsey
  mayHaveSideEffects: YES # TODO: actual logic
  toJSON: ->
    nodeType: @className
    expression: @expr?.toJSON()
    cases: for [exprs, block] in @cases
      [e.toJSON() for e in exprs, block.toJSON()]
    elseBlock: @elseBlock?.toJSON()

# This :: This
class @This extends Statement
  className: 'This'
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: NO

# Throw :: Exprs -> Throw
class @Throw extends UnaryOp
  className: 'Throw'
  constructor: (@expr) ->

# Try :: Block -> Maybe Assignable -> Maybe Block -> Maybe Block -> Try
class @Try extends @Node
  className: 'Try'
  constructor: (@block, @catchAssignee, @catchBlock, @finallyBlock) ->
  childNodes: ['block', 'catchBlock', 'finallyBlock']
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()
    catchAssignee: @catchAssignee?.toJSON()
    catchBlock: @catchBlock?.toJSON()
    finallyBlock: @finallyBlock?.toJSON()

# TypeofOp :: Exprs -> TypeofOp
class @TypeofOp extends UnaryOp
  className: 'TypeofOp'
  constructor: (@expr) ->
  isTruthy: YES

# UnaryExistsOp :: Exprs -> UnaryExistsOp
class @UnaryExistsOp extends UnaryOp
  className: 'UnaryExistsOp'
  constructor: (@expr) ->

# UnaryNegateOp :: Exprs -> UnaryNegateOp
class @UnaryNegateOp extends UnaryOp
  className: 'UnaryNegateOp'
  constructor: (@expr) ->

# UnaryPlusOp :: Exprs -> UnaryPlusOp
class @UnaryPlusOp extends UnaryOp
  className: 'UnaryPlusOp'
  constructor: (@expr) ->

# Undefined :: Undefined
class @Undefined extends Statement
  className: 'Undefined'
  constructor: -> # jashkenas/coffee-script#2359
  isFalsey: YES
  mayHaveSideEffects: NO

# UnsignedRightShiftOp :: Exprs -> Exprs -> UnsignedRightShiftOp
class @UnsignedRightShiftOp extends BinOp
  className: 'UnsignedRightShiftOp'
  constructor: (@left, @right) ->

# While :: Exprs -> Maybe Block -> While
class @While extends @Node
  className: 'While'
  constructor: (@condition, @block) ->
  childNodes: ['condition', 'block']
  isTruthy: YES
  mayHaveSideEffects: (inScope) ->
    (@condition.mayHaveSideEffects inScope) or
    (not @condition.falsey() and @block.mayHaveSideEffects inScope)
  toJSON: ->
    nodeType: @className
    condition: @condition.toJSON()
    block: @block?.toJSON()

# Note: This only represents the original syntactic specification as an
# "until". The node should be treated in all other ways as a While.
# NegatedWhile :: Exprs -> Maybe Block -> NegatedWhile
class @NegatedWhile extends @While
  constructor: (@condition, @block) ->

# Note: This only represents the original syntactic specification as a "loop".
# The node should be treated in all other ways as a While.
# Loop :: Maybe Block -> Loop
class @Loop extends @While
  constructor: (@block) ->
    @condition = (new Bool true).g()
