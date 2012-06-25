exports = this


binOpToJSON = ->
  nodeType: @className
  left: @left.toJSON()
  right: @right.toJSON()

unaryOpToJSON = ->
  nodeType: @className
  expression: @expr.toJSON()

assignOpToJSON = ->
  nodeType: @className
  assignee: @assignee.toJSON()
  expression: @expr.toJSON()

statementToJSON = -> nodeType: @className

primitiveToJSON = ->
  nodeType: @className
  data: @data


class @Node
  generated: no
  r: (@raw) -> this
  p: (@line, @column) -> this
  g: ->
    @generated = yes
    this


# AddOp :: Exprs -> Exprs -> AddOp
class @AddOp extends @Node
  className: 'AddOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ArrayInitialiser :: [ArrayInitialiserMembers] -> ArrayInitialiser
class @ArrayInitialiser extends @Node
  className: 'ArrayInitialiser'
  constructor: (@exprs) ->
  toJSON: ->
    nodeType: @className
    expressions: (e.toJSON() for e in @exprs)

# AssignOp :: Assignables -> Exprs -> AssignOp
class @AssignOp extends @Node
  className: 'AssignOp'
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# BitAndOp :: Exprs -> Exprs -> BitAndOp
class @BitAndOp extends @Node
  className: 'BitAndOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# BitNotOp :: Exprs -> BitNotOp
class @BitNotOp extends @Node
  className: 'BitNotOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# BitOrOp :: Exprs -> Exprs -> BitOrOp
class @BitOrOp extends @Node
  className: 'BitOrOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# BitXorOp :: Exprs -> Exprs -> BitXorOp
class @BitXorOp extends @Node
  className: 'BitXorOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Block :: [Statement] -> Block
class @Block extends @Node
  Block = this
  className: 'Block'
  constructor: (@statements) ->
  @wrap = (s) -> new Block([s]).r(s.raw).p(s.line, s.column)
  toJSON: ->
    nodeType: @className
    statements: (s.toJSON() for s in @statements)

# Bool :: bool -> Bool
class @Bool extends @Node
  className: 'Bool'
  constructor: (@data) ->
  toJSON: primitiveToJSON

# BoundFunction :: [Parameters] -> Block -> BoundFunction
class @BoundFunction extends @Node
  className: 'BoundFunction'
  constructor: (@parameters, @block) ->
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block.toJSON()

# Break :: Break
class @Break extends @Node
  className: 'Break'
  constructor: ->
  toJSON: statementToJSON

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
  toJSON: ->
    nodeType: @className
    nameAssignment: @nameAssignment?.toJSON()
    name: @name
    parent: @parent?.toJSON()
    block: @block?.toJSON()

# ClassProtoAssignOp :: ObjectInitialiserKeys -> Exprs -> ClassProtoAssignOp
class @ClassProtoAssignOp extends @Node
  className: 'ClassProtoAssignOp'
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# CompoundAssignOp :: CompoundAssignableOps -> Assignables -> Exprs -> CompoundAssignOp
class @CompoundAssignOp extends @Node
  className: 'CompoundAssignOp'
  constructor: (@op, @assignee, @expr) ->
  toJSON: ->
    nodeType: @className
    op: @op::className
    assignee: @assignee.toJSON()
    expression: @expr.toJSON()

# a tree of ConcatOp represents interpolation
# ConcatOp :: Exprs -> Exprs -> ConcatOp
class @ConcatOp extends @Node
  className: 'ConcatOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Conditional :: Exprs -> Maybe Block -> Maybe Block -> Conditional
Conditional = class @Conditional extends @Node
  className: 'Conditional'
  constructor: (@condition, @block, @elseBlock) ->
  toJSON: ->
    nodeType: @className
    block: @block?.toJSON()
    elseBlock: @elseBlock?.toJSON()

# NegatedConditional :: Exprs -> Block -> Maybe Block -> NegatedConditional
class @NegatedConditional extends @Node
  className: 'NegatedConditional'
  constructor: (@condition, @block, @elseBlock) ->
  toJSON: Conditional::toJSON

# Continue :: Continue
class @Continue extends @Node
  className: 'Continue'
  constructor: ->
  toJSON: statementToJSON

# DeleteOp :: MemberAccessOps -> DeleteOp
class @DeleteOp extends @Node
  className: 'DeleteOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# DivideOp :: Exprs -> Exprs -> DivideOp
class @DivideOp extends @Node
  className: 'DivideOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# DoOp :: Exprs -> DoOp
class @DoOp extends @Node
  className: 'DoOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# DynamicMemberAccessOp :: Exprs -> Exprs -> DynamicMemberAccessOp
DynamicMemberAccessOp = class @DynamicMemberAccessOp extends @Node
  className: 'DynamicMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    indexingExpression: @indexingExpr.toJSON()

# DynamicProtoMemberAccessOp :: Exprs -> Exprs -> DynamicProtoMemberAccessOp
class @DynamicProtoMemberAccessOp extends @Node
  className: 'DynamicProtoMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->
  toJSON: DynamicMemberAccessOp::toJSON

# SoakedDynamicMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicMemberAccessOp
class @SoakedDynamicMemberAccessOp extends @Node
  className: 'SoakedDynamicMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->
  toJSON: DynamicMemberAccessOp::toJSON

# we don't currently support this, but for consistency we should
# SoakedDynamicProtoMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicProtoMemberAccessOp
class @SoakedDynamicProtoMemberAccessOp extends @Node
  className: 'SoakedDynamicProtoMemberAccessOp'
  constructor: (@expr, @indexingExpr) ->
  toJSON: DynamicMemberAccessOp::toJSON

# EQOp :: Exprs -> Exprs -> EQOp
class @EQOp extends @Node
  className: 'EQOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ExclusiveRange :: Exprs -> Exprs -> ExclusiveRange
class @ExclusiveRange extends @Node
  className: 'ExclusiveRange'
  constructor: (@from, @til) ->
  toJSON: ->
    nodeType: @className
    from: @from.toJSON()
    til: @til.toJSON()

# ExclusiveSlice :: Exprs -> Exprs -> Exprs -> ExclusiveSlice
class @ExclusiveSlice extends @Node
  className: 'ExclusiveSlice'
  constructor: (@expr, @from, @til) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    from: @from.toJSON()
    til: @til.toJSON()

# ExistsAssignOp :: Assignables -> Exprs -> ExistsAssignOp
class @ExistsAssignOp extends @Node
  className: 'ExistsAssignOp'
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# ExistsOp :: Exprs -> Exprs -> ExistsOp
class @ExistsOp extends @Node
  className: 'ExistsOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ExtendsOp :: Exprs -> Exprs -> ExtendsOp
class @ExtendsOp extends @Node
  className: 'ExtendsOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Float :: float -> Float
class @Float extends @Node
  className: 'Float'
  constructor: (@data) ->
  toJSON: primitiveToJSON

# ForIn :: Assignable -> Maybe Assignable -> Exprs -> Exprs -> Maybe Exprs -> Block -> ForIn
class @ForIn extends @Node
  className: 'ForIn'
  constructor: (@valAssignee, @keyAssignee, @expr, @step, @filterExpr, @block) ->
  toJSON: ->
    nodeType: @className
    valAssignee: @valAssignee.toJSON()
    keyAssignee: @keyAssignee?.toJSON()
    expression: @expr.toJSON()
    step: @step.toJSON()
    filterExpression: @filterExpr?.toJSON()
    block: @block.toJSON()

# ForOf :: bool -> Assignable -> Maybe Assignable -> Exprs -> Exprs -> Block -> ForOf
class @ForOf extends @Node
  className: 'ForOf'
  constructor: (@isOwn, @keyAssignee, @valAssignee, @expr, @filterExpr, @block) ->
  toJSON: ->
    nodeType: @className
    isOwn: @isOwn
    keyAssignee: @keyAssignee.toJSON()
    valAssignee: @valAssignee?.toJSON()
    expression: @expr.toJSON()
    filterExpression: @filterExpr.toJSON()
    block: @block.toJSON()

# Function :: [Parameters] -> Maybe Block -> Function
class @Function extends @Node
  className: 'Function'
  constructor: (@parameters, @block) ->
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block?.toJSON()

# FunctionApplication :: Exprs -> [Arguments] -> FunctionApplication
FunctionApplication = class @FunctionApplication extends @Node
  className: 'FunctionApplication'
  constructor: (@function, @arguments) ->
  toJSON: ->
    nodeType: @className
    function: @function.toJSON()
    arguments: (a.toJSON() for a in @arguments)

# SoakedFunctionApplication :: Exprs -> [Arguments] -> SoakedFunctionApplication
class @SoakedFunctionApplication extends @Node
  className: 'SoakedFunctionApplication'
  constructor: (@function, @arguments) ->
  toJSON: FunctionApplication::toJSON

# GTEOp :: Exprs -> Exprs -> GTEOp
class @GTEOp extends @Node
  className: 'GTEOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# GTOp :: Exprs -> Exprs -> GTOp
class @GTOp extends @Node
  className: 'GTOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# HeregExp :: Exprs -> [string] -> HeregExp
class @HeregExp extends @Node
  className: 'HeregExp'
  constructor: (@expr, flags) ->
    @flags = {}
    for flag in ['g', 'i', 'm', 'y']
      @flags[flag] = flag in flags
  toJSON: ->
    nodeType: @className
    expression: @expr
    flags: @flags

# Identifier :: string -> Identifier
class @Identifier extends @Node
  className: 'Identifier'
  constructor: (@data) ->
  toJSON: primitiveToJSON

# InOp :: Exprs -> Exprs -> InOp
class @InOp extends @Node
  className: 'InOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# InclusiveRange :: Exprs -> Exprs -> InclusiveRange
class @InclusiveRange extends @Node
  className: 'InclusiveRange'
  constructor: (@from, @to) ->
  toJSON: ->
    nodeType: @className
    from: @from.toJSON()
    to: @to.toJSON()

# InclusiveSlice :: Exprs -> Exprs -> Exprs -> InclusiveSlice
class @InclusiveSlice extends @Node
  className: 'InclusiveSlice'
  constructor: (@expr, @from, @to) ->
  toJSON: ->
    nodeType: @className
    expression: @expression.toJSON()
    from: @from.toJSON()
    to: @to.toJSON()

# InstanceofOp :: Exprs -> Exprs -> InstanceofOp
class @InstanceofOp extends @Node
  className: 'InstanceofOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Int :: float -> Int
class @Int extends @Node
  className: 'Int'
  constructor: (@data) ->
  toJSON: primitiveToJSON

# JavaScript :: string -> JavaScript
class @JavaScript extends @Node
  className: 'JavaScript'
  constructor: (@data) ->
  toJSON: primitiveToJSON

# LTEOp :: Exprs -> Exprs -> LTEOp
class @LTEOp extends @Node
  className: 'LTEOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LTOp :: Exprs -> Exprs -> LTOp
class @LTOp extends @Node
  className: 'LTOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LeftShiftOp :: Exprs -> Exprs -> LeftShiftOp
class @LeftShiftOp extends @Node
  className: 'LeftShiftOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LogicalAndOp :: Exprs -> Exprs -> LogicalAndOp
class @LogicalAndOp extends @Node
  className: 'LogicalAndOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LogicalNotOp :: Exprs -> LogicalNotOp
class @LogicalNotOp extends @Node
  className: 'LogicalNotOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# LogicalOrOp :: Exprs -> Exprs -> LogicalOrOp
class @LogicalOrOp extends @Node
  className: 'LogicalOrOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# MemberAccessOp :: Exprs -> MemberNames -> MemberAccessOp
MemberAccessOp = class @MemberAccessOp extends @Node
  className: 'MemberAccessOp'
  constructor: (@expr, @memberName) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    memberName: @memberName

# ProtoMemberAccessOp :: Exprs -> MemberNames -> ProtoMemberAccessOp
class @ProtoMemberAccessOp extends @Node
  className: 'ProtoMemberAccessOp'
  constructor: (@expr, @memberName) ->
  toJSON: MemberAccessOp::toJSON

# SoakedMemberAccessOp :: Exprs -> MemberNames -> SoakedMemberAccessOp
class @SoakedMemberAccessOp extends @Node
  className: 'SoakedMemberAccessOp'
  constructor: (@expr, @memberName) ->
  toJSON: MemberAccessOp::toJSON

# we don't currently support this, but for consistency we should
# SoakedProtoMemberAccessOp :: Exprs -> MemberNames -> SoakedProtoMemberAccessOp
class @SoakedProtoMemberAccessOp extends @Node
  className: 'SoakedProtoMemberAccessOp'
  constructor: (@expr, @memberName) ->
  toJSON: MemberAccessOp::toJSON

# MultiplyOp :: Exprs -> Exprs -> MultiplyOp
class @MultiplyOp extends @Node
  className: 'MultiplyOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# NEQOp :: Exprs -> Exprs -> NEQOp
class @NEQOp extends @Node
  className: 'NEQOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# NewOp :: Exprs -> [Arguments] -> NewOp
class @NewOp extends @Node
  className: 'NewOp'
  constructor: (@ctor, @arguments) ->
  toJSON: ->
    nodeType: @className
    constructor: @ctor.toJSON()
    arguments: (a.toJSON() for a in @arguments)

# Null :: Null
class @Null extends @Node
  className: 'Null'
  constructor: ->
  toJSON: statementToJSON

# ObjectInitialiser :: [(ObjectInitialiserKeys, Exprs)] -> ObjectInitialiser
class @ObjectInitialiser extends @Node
  className: 'ObjectInitialiser'
  constructor: (@members) ->
  toJSON: ->
    nodeType: @className
    members: for [key, expr] in @members
      [key.toJSON(), expr.toJSON()]

# OfOp :: Exprs -> Exprs -> OfOp
class @OfOp extends @Node
  className: 'OfOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# PreDecrementOp :: Exprs -> PreDecrementOp
class @PreDecrementOp extends @Node
  className: 'PreDecrementOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PreIncrementOp :: Exprs -> PreIncrementOp
class @PreIncrementOp extends @Node
  className: 'PreIncrementOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PostDecrementOp :: Exprs -> PostDecrementOp
class @PostDecrementOp extends @Node
  className: 'PostDecrementOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PostIncrementOp :: Exprs -> PostIncrementOp
class @PostIncrementOp extends @Node
  className: 'PostIncrementOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Program :: Maybe Block -> Program
class @Program extends @Node
  className: 'Program'
  constructor: (@block) ->
  toJSON: ->
    nodeType: @className
    block: @block?.toJSON()

# RegExp :: string -> [string] -> RegExp
class @RegExp extends @Node
  className: 'RegExp'
  constructor: (@data, flags) ->
    @flags = {}
    for flag in ['g', 'i', 'm', 'y']
      @flags[flag] = flag in flags
  toJSON: ->
    nodeType: @className
    data: @data
    flags: @flags

# RemOp :: Exprs -> Exprs -> RemOp
class @RemOp extends @Node
  className: 'RemOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Rest :: Exprs -> Rest
class @Rest extends @Node
  className: 'Rest'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Return :: Exprs -> Return
class @Return extends @Node
  className: 'Return'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# SeqOp :: Exprs -> Exprs -> SeqOp
class @SeqOp extends @Node
  className: 'SeqOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# SignedRightShiftOp :: Exprs -> Exprs -> SignedRightShiftOp
class @SignedRightShiftOp extends @Node
  className: 'SignedRightShiftOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Slice :: Exprs -> bool -> Maybe Exprs -> Maybe Exprs -> Slice
class @Slice extends @Node
  className: 'Slice'
  constructor: (@expr, @isInclusive, @left, @right) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    isInclusive: @isInclusive
    left: @left?.toJSON()
    right: @right?.toJSON()

# Spread :: Exprs -> Spread
class @Spread extends @Node
  className: 'Spread'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# String :: string -> String
class @String extends @Node
  className: 'String'
  constructor: (@data) ->
  toJSON: primitiveToJSON

# SubtractOp :: Exprs -> Exprs -> SubtractOp
class @SubtractOp extends @Node
  className: 'SubtractOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Super :: [Arguments] -> Super
class @Super extends @Node
  className: 'Super'
  constructor: (@arguments) ->
  toJSON: ->
    nodeType: @className
    arguments: (a.toJSON() for a in @arguments)

# Switch :: Maybe Exprs -> [([Exprs], Block)] -> Maybe Block -> Switch
class @Switch extends @Node
  className: 'Switch'
  constructor: (@expr, @cases, @elseBlock) ->
  toJSON: ->
    nodeType: @className
    expression: @expr?.toJSON()
    cases: for [exprs, block] in @cases
      [e.toJSON() for e in exprs, block.toJSON()]
    elseBlock: @elseBlock?.toJSON()

# This :: This
class @This extends @Node
  className: 'This'
  constructor: ->
  toJSON: statementToJSON

# Throw :: Exprs -> Throw
class @Throw extends @Node
  className: 'Throw'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Try :: Block -> Maybe Assignable -> Maybe Block -> Maybe Block -> Try
class @Try extends @Node
  className: 'Try'
  constructor: (@block, @catchAssignee, @catchBlock, @finallyBlock) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()
    catchAssignee: @catchAssignee?.toJSON()
    catchBlock: @catchBlock?.toJSON()
    finallyBlock: @finallyBlock?.toJSON()

# TypeofOp :: Exprs -> TypeofOp
class @TypeofOp extends @Node
  className: 'TypeofOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryExistsOp :: Exprs -> UnaryExistsOp
class @UnaryExistsOp extends @Node
  className: 'UnaryExistsOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryNegateOp :: Exprs -> UnaryNegateOp
class @UnaryNegateOp extends @Node
  className: 'UnaryNegateOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryPlusOp :: Exprs -> UnaryPlusOp
class @UnaryPlusOp extends @Node
  className: 'UnaryPlusOp'
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Undefined :: Undefined
class @Undefined extends @Node
  className: 'Undefined'
  constructor: ->
  toJSON: statementToJSON

# UnsignedRightShiftOp :: Exprs -> Exprs -> UnsignedRightShiftOp
class @UnsignedRightShiftOp extends @Node
  className: 'UnsignedRightShiftOp'
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# While :: Exprs -> Block -> While
While = class @While extends @Node
  className: 'While'
  constructor: (@condition, @block) ->
  toJSON: ->
    nodeType: @className
    condition: @condition.toJSON()
    block: @block.toJSON()

# NegatedWhile :: Exprs -> Block -> NegatedWhile
class @NegatedWhile extends @Node
  className: 'NegatedWhile'
  constructor: (@condition, @block) ->
  toJSON: While::toJSON

# Loop :: Block -> Loop
class @Loop extends @Node
  className: 'Loop'
  constructor: (@block) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()
