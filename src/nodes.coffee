YES = -> yes
NO = -> no
any = (list, fn) ->
  for e in list
    return yes if fn e
  no


class @Node
  generated: no
  toJSON: -> nodeType: @className
  r: (@raw) -> this
  p: (@line, @column) -> this
  g: ->
    @generated = yes
    this

class AssignOp extends @Node
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: YES
  toJSON: ->
    nodeType: @className
    assignee: @assignee.toJSON()
    expression: @expr.toJSON()

class BinOp extends @Node
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: ->
    @left.mayHaveSideEffects() or @right.mayHaveSideEffects()
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
  mayHaveSideEffects: ->
    # Note: CoffeeScript willfully ignores the existence of `valueOf`
    @expr.mayHaveSideEffects()
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()


# ArrayInitialiser :: [ArrayInitialiserMembers] -> ArrayInitialiser
class @ArrayInitialiser extends @Node
  className: 'ArrayInitialiser'
  constructor: (@members) ->
  mayHaveSideEffects: -> any @members, (m) -> m.mayHaveSideEffects()
  toJSON: ->
    nodeType: @className
    members: (m.toJSON() for m in @members)

# AssignOp :: Assignables -> Exprs -> AssignOp
class @AssignOp extends AssignOp
  className: 'AssignOp'
  constructor: (@assignee, @expr) ->

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
class @Block extends @Node
  Block = this
  className: 'Block'
  constructor: (@statements) ->
  @wrap = (s) -> new Block([s]).r(s.raw).p(s.line, s.column)
  mayHaveSideEffects: -> any @statements, (s) -> s.mayHaveSideEffects()
  toJSON: ->
    nodeType: @className
    statements: (s.toJSON() for s in @statements)

# Bool :: bool -> Bool
Bool = class @Bool extends Primitive
  className: 'Bool'
  constructor: (@data) ->

# BoundFunction :: [Parameters] -> Block -> BoundFunction
class @BoundFunction extends @Node
  className: 'BoundFunction'
  constructor: (@parameters, @block) ->
  mayHaveSideEffects: NO
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block.toJSON()

# Break :: Break
class @Break extends Statement
  className: 'Break'
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: NO # TODO: I'm not even sure if this question is well-formed

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
  mayHaveSideEffects: YES # TODO: actually test
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

# CompoundAssignOp :: CompoundAssignableOps -> Assignables -> Exprs -> CompoundAssignOp
class @CompoundAssignOp extends @Node
  className: 'CompoundAssignOp'
  constructor: (@op, @assignee, @expr) ->
  mayHaveSideEffects: YES
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
  mayHaveSideEffects: ->
    # TODO: only check each respective block if the condition would allow execution to get there
    !!(@condition.mayHaveSideEffects() or @block?.mayHaveSideEffects() or @elseBlock?.mayHaveSideEffects())
  constructor: (@condition, @block, @elseBlock) ->
  toJSON: ->
    nodeType: @className
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
  mayHaveSideEffects: NO # TODO: I'm not even sure if this question is well-formed

# DeleteOp :: MemberAccessOps -> DeleteOp
class @DeleteOp extends UnaryOp
  className: 'DeleteOp'
  constructor: (@expr) ->
  mayHaveSideEffects: YES

# DivideOp :: Exprs -> Exprs -> DivideOp
class @DivideOp extends BinOp
  className: 'DivideOp'
  constructor: (@left, @right) ->

# DoOp :: Exprs -> DoOp
class @DoOp extends UnaryOp
  className: 'DoOp'
  constructor: (@expr) ->
  mayHaveSideEffects: YES

# DynamicMemberAccessOp :: Exprs -> Exprs -> DynamicMemberAccessOp
class @DynamicMemberAccessOp extends @Node
  className: 'DynamicMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->
  mayHaveSideEffects: ->
    # Technically, this is a lie. It should be YES, but CoffeeScript is
    # willfully ignorant of the existence of getters/setters.
    @expr.mayHaveSideEffects() or @indexingExpr.mayHaveSideEffects()
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

# ForIn :: Assignable -> Maybe Assignable -> Exprs -> Exprs -> Maybe Exprs -> Block -> ForIn
class @ForIn extends @Node
  className: 'ForIn'
  constructor: (@valAssignee, @keyAssignee, @expr, @step, @filterExpr, @block) ->
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
  mayHaveSideEffects: NO
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block?.toJSON()

# FunctionApplication :: Exprs -> [Arguments] -> FunctionApplication
class @FunctionApplication extends @Node
  className: 'FunctionApplication'
  constructor: (@function, @arguments) ->
  mayHaveSideEffects: YES
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
  mayHaveSideEffects: YES # TODO: actual logic
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
  constructor: (@left, @right) ->
  # TODO: override BinOp::mayHaveSideEffects, respecting short-circuiting behaviour

# LogicalNotOp :: Exprs -> LogicalNotOp
class @LogicalNotOp extends UnaryOp
  className: 'LogicalNotOp'
  constructor: (@expr) ->

# LogicalOrOp :: Exprs -> Exprs -> LogicalOrOp
class @LogicalOrOp extends BinOp
  className: 'LogicalOrOp'
  constructor: (@left, @right) ->
  # TODO: override BinOp::mayHaveSideEffects, respecting short-circuiting behaviour

# MemberAccessOp :: Exprs -> MemberNames -> MemberAccessOp
class @MemberAccessOp extends @Node
  className: 'MemberAccessOp'
  constructor: (@expr, @memberName) ->
  mayHaveSideEffects: ->
    # Technically, this is a lie. It should be YES, but CoffeeScript is
    # willfully ignorant of the existence of getters/setters.
    @expr.mayHaveSideEffects()
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
  mayHaveSideEffects: YES
  toJSON: ->
    nodeType: @className
    constructor: @ctor.toJSON()
    arguments: (a.toJSON() for a in @arguments)

# Null :: Null
class @Null extends Statement
  className: 'Null'
  constructor: -> # jashkenas/coffee-script#2359
  mayHaveSideEffects: NO

# ObjectInitialiser :: [(ObjectInitialiserKeys, Exprs)] -> ObjectInitialiser
class @ObjectInitialiser extends @Node
  className: 'ObjectInitialiser'
  constructor: (@members) ->
  mayHaveSideEffects: ->
    any @members, ([key, expr]) ->
      key.mayHaveSideEffects() or expr.mayHaveSideEffects()
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
  mayHaveSideEffects: -> !!@block?.mayHaveSideEffects()
  toJSON: ->
    nodeType: @className
    block: @block?.toJSON()

# Range :: bool -> Exprs -> Exprs -> Range
class @Range extends @Node
  className: 'Range'
  constructor: (@isInclusive, @left, @right) ->
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
  mayHaveSideEffects: YES # TODO: ...?
  constructor: (@expr) ->

# SeqOp :: Exprs -> Exprs -> SeqOp
class @SeqOp extends BinOp
  className: 'SeqOp'
  constructor: (@left, @right) ->

# SignedRightShiftOp :: Exprs -> Exprs -> SignedRightShiftOp
class @SignedRightShiftOp extends BinOp
  className: 'SignedRightShiftOp'
  constructor: (@left, @right) ->

# Slice :: Exprs -> bool -> Maybe Exprs -> Maybe Exprs -> Slice
class @Slice extends @Node
  className: 'Slice'
  constructor: (@expr, @isInclusive, @left, @right) ->
  mayHaveSideEffects: ->
    !!(@expr.mayHaveSideEffects() or @left?.mayHaveSideEffects() or @right?.mayHaveSideEffects())
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

# SubtractOp :: Exprs -> Exprs -> SubtractOp
class @SubtractOp extends BinOp
  className: 'SubtractOp'
  constructor: (@left, @right) ->

# Super :: [Arguments] -> Super
class @Super extends @Node
  className: 'Super'
  constructor: (@arguments) ->
  mayHaveSideEffects: YES
  toJSON: ->
    nodeType: @className
    arguments: (a.toJSON() for a in @arguments)

# Switch :: Maybe Exprs -> [([Exprs], Block)] -> Maybe Block -> Switch
class @Switch extends @Node
  className: 'Switch'
  constructor: (@expr, @cases, @elseBlock) ->
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
  mayHaveSideEffects: YES # TODO: ...?

# Try :: Block -> Maybe Assignable -> Maybe Block -> Maybe Block -> Try
class @Try extends @Node
  className: 'Try'
  constructor: (@block, @catchAssignee, @catchBlock, @finallyBlock) ->
  mayHaveSideEffects: YES # TODO: actual logic
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
  mayHaveSideEffects: NO

# UnsignedRightShiftOp :: Exprs -> Exprs -> UnsignedRightShiftOp
class @UnsignedRightShiftOp extends BinOp
  className: 'UnsignedRightShiftOp'
  constructor: (@left, @right) ->

# While :: Exprs -> Maybe Block -> While
class @While extends @Node
  className: 'While'
  constructor: (@condition, @block) ->
  mayHaveSideEffects: ->
    @condition.mayHaveSideEffects()
  toJSON: ->
    nodeType: @className
    condition: @condition.toJSON()
    block: @block?.toJSON()

# Note: This only represents the original syntactic specification as an
# "until". The node should be treated in all other ways as a While.
# NegatedWhile :: Exprs -> Block -> NegatedWhile
class @NegatedWhile extends @While
  constructor: (@condition, @block) ->

# Note: This only represents the original syntactic specification as a "loop".
# The node should be treated in all other ways as a While.
# Loop :: Maybe Block -> Loop
class @Loop extends @While
  constructor: (@block) ->
    @condition = (new Bool true).g()
