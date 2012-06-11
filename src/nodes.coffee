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


# AddOp :: Exprs -> Exprs -> AddOp
class @AddOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ArrayInitialiser :: [ArrayInitialiserMembers] -> ArrayInitialiser
class @ArrayInitialiser
  constructor: (@exprs) ->
  toJSON: ->
    nodeType: @className
    expressions: (e.toJSON() for e in @exprs)

# AssignOp :: Assignables -> Exprs -> AssignOp
class @AssignOp
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# BitAndOp :: Exprs -> Exprs -> BitAndOp
class @BitAndOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# BitNotOp :: Exprs -> BitNotOp
class @BitNotOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# BitOrOp :: Exprs -> Exprs -> BitOrOp
class @BitOrOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# BitXorOp :: Exprs -> Exprs -> BitXorOp
class @BitXorOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Block :: [Statement] -> Block
class @Block
  constructor: (@statements) ->
  toJSON: ->
    nodeType: @className
    statements: (s.toJSON() for s in @statements)

# Bool :: bool -> Bool
class @Bool
  constructor: (@data) ->
  toJSON: primitiveToJSON

# BoundFunction :: [Parameters] -> Block -> BoundFunction
class @BoundFunction
  constructor: (@parameters, @block) ->
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block.toJSON()

# Break :: Break
class @Break
  constructor: ->
  toJSON: statementToJSON

# class @:: Maybe Assignable -> Maybe Exprs -> [Exprs] -> Class
class @Class
  constructor: (@nameAssignment, @parent, @exprs) ->
    @name =
      if @nameAssignment?
        # poor man's pattern matching
        switch @nameAssignment.className
          when "Identifier"
            @nameAssignment
          when "MemberAccessOp", "ProtoMemberAccessOp", "SoakedMemberAccessOp", "SoakedProtoMemberAccessOp"
            @nameAssignment.memberName
          else null
      else null
  toJSON: ->
    nodeType: @className
    nameAssignment: @nameAssignment?.toJSON()
    name: @name
    parent: @parent?.toJSON()
    expressions: (e.toJSON() for e in @exprs)

# ClassProtoAssignOp :: MemberNames -> Exprs -> ClassProtoAssignOp
class @ClassProtoAssignOp
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# CompoundAssignOp :: CompoundAssignableOps -> Assignables -> Exprs -> CompoundAssignOp
class @CompoundAssignOp
  constructor: (@op, @assignee, @expr) ->
  toJSON: ->
    nodeType: @className
    op: @op::className
    assignee: @assignee.toJSON()
    expression: @expr.toJSON()

# a tree of ConcatOp represents interpolation
# ConcatOp :: Exprs -> Exprs -> ConcatOp
class @ConcatOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Conditional :: Exprs -> Block -> Maybe Block -> Conditional
class @Conditional
  constructor: (@condition, @block, @elseBlock) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()
    elseBlock: @elseBlock?.toJSON()

# Continue :: Continue
class @Continue
  constructor: ->
  toJSON: statementToJSON

# DeleteOp :: MemberAccessOps -> DeleteOp
class @DeleteOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# DivideOp :: Exprs -> Exprs -> DivideOp
class @DivideOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# DoOp :: Exprs -> DoOp
class @DoOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# DynamicMemberAccessOp :: Exprs -> Exprs -> DynamicMemberAccessOp
class @DynamicMemberAccessOp
  constructor: (@expr, @indexingExpr) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    indexingExpression: @indexingExpr.toJSON()

# DynamicProtoMemberAccessOp :: Exprs -> Exprs -> DynamicProtoMemberAccessOp
class @DynamicProtoMemberAccessOp
  constructor: (@expr, @indexingExpr) ->
  toJSON: exports.DynamicMemberAccessOp::toJSON

# EQOp :: Exprs -> Exprs -> EQOp
class @EQOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ExclusiveRange :: Exprs -> Exprs -> ExclusiveRange
class @ExclusiveRange
  constructor: (@from, @til) ->
  toJSON: ->
    nodeType: @className
    from: @from.toJSON()
    til: @til.toJSON()

# ExclusiveSlice :: Exprs -> Exprs -> Exprs -> ExclusiveSlice
class @ExclusiveSlice
  constructor: (@expr, @from, @til) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    from: @from.toJSON()
    til: @til.toJSON()

# ExistsAssignOp :: Assignables -> Exprs -> ExistsAssignOp
class @ExistsAssignOp
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# ExistsOp :: Exprs -> Exprs -> ExistsOp
class @ExistsOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ExtendsOp :: Exprs -> Exprs -> ExtendsOp
class @ExtendsOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Float :: float -> Float
class @Float
  constructor: (@data) ->
  toJSON: primitiveToJSON

# ForIn :: Assignable -> Maybe Assignable -> Exprs -> Exprs -> Block -> ForIn
class @ForIn
  constructor: (@valAssignee, @keyAssignee, @expr, @filterExpr, @block) ->
  toJSON: ->
    nodeType: @className
    valAssignee: @valAssignee.toJSON()
    keyAssignee: @keyAssignee?.toJSON()
    expression: @expr.toJSON()
    filterExpression: @filterExp.toJSON()
    block: @block.toJSON()

# ForOf :: bool -> Assignable -> Maybe Assignable -> Exprs -> Exprs -> Block -> ForOf
class @ForOf
  constructor: (@isOwn, @keyAssignee, @valAssignee, @expr, @filterExpr, @block) ->
  toJSON: ->
    nodeType: @className
    isOwn: @isOwn
    keyAssignee: @keyAssignee.toJSON()
    valAssignee: @valAssignee?.toJSON()
    expression: @expr.toJSON()
    filterExpression: @filterExp.toJSON()
    block: @block.toJSON()

# Function :: [Parameters] -> Block -> Function
class @Function
  constructor: (@parameters, @block) ->
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block.toJSON()

# FunctionApplication :: Exprs -> [Arguments] -> FunctionApplication
class @FunctionApplication
  constructor: (@function, @arguments) ->
  toJSON: ->
    nodeType: @className
    function: @function.toJSON()
    arguments: (a.toJSON() for a in @arguments)

# GTEOp :: Exprs -> Exprs -> GTEOp
class @GTEOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# GTOp :: Exprs -> Exprs -> GTOp
class @GTOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Identifier :: string -> Identifier
class @Identifier
  constructor: (@data) ->
  toJSON: primitiveToJSON

# InOp :: Exprs -> Exprs -> InOp
class @InOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# InclusiveRange :: Exprs -> Exprs -> InclusiveRange
class @InclusiveRange
  constructor: (@from, @to) ->
  toJSON: ->
    nodeType: @className
    from: @from.toJSON()
    to: @to.toJSON()

# InclusiveSlice :: Exprs -> Exprs -> Exprs -> InclusiveSlice
class @InclusiveSlice
  constructor: (@expr, @from, @to) ->
  toJSON: ->
    nodeType: @className
    expression: @expression.toJSON()
    from: @from.toJSON()
    to: @to.toJSON()

# InstanceofOp :: Exprs -> Exprs -> InstanceofOp
class @InstanceofOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Int :: float -> Int
class @Int
  constructor: (@data) ->
  toJSON: primitiveToJSON

# JavaScript :: string -> JavaScript
class @JavaScript
  constructor: (@data) ->
  toJSON: primitiveToJSON

# LTEOp :: Exprs -> Exprs -> LTEOp
class @LTEOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LTOp :: Exprs -> Exprs -> LTOp
class @LTOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LeftShiftOp :: Exprs -> Exprs -> LeftShiftOp
class @LeftShiftOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LogicalAndOp :: Exprs -> Exprs -> LogicalAndOp
class @LogicalAndOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LogicalNotOp :: Exprs -> LogicalNotOp
class @LogicalNotOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# LogicalOrOp :: Exprs -> Exprs -> LogicalOrOp
class @LogicalOrOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# MemberAccessOp :: Exprs -> MemberNames -> MemberAccessOp
class @MemberAccessOp
  constructor: (@expr, @memberName) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    memberName: @memberName.toJSON()

# MultiplyOp :: Exprs -> Exprs -> MultiplyOp
class @MultiplyOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# NEQOp :: Exprs -> Exprs -> NEQOp
class @NEQOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# NewOp :: Exprs -> NewOp
class @NewOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Null :: Null
class @Null
  constructor: ->
  toJSON: statementToJSON

# ObjectInitialiser :: [(ObjectInitialiserKeys, Exprs)] -> ObjectInitialiser
class @ObjectInitialiser
  constructor: (@assignments) ->
  toJSON: ->
    nodeType: @className
    assignments: for [key, expr] in @assignments
      [key.toJSON(), expr.toJSON()]

# OfOp :: Exprs -> Exprs -> OfOp
class @OfOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# PreDecrementOp :: Exprs -> PreDecrementOp
class @PreDecrementOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PreIncrementOp :: Exprs -> PreIncrementOp
class @PreIncrementOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PostDecrementOp :: Exprs -> PostDecrementOp
class @PostDecrementOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PostIncrementOp :: Exprs -> PostIncrementOp
class @PostIncrementOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Program :: Block -> Program
class @Program
  constructor: (@block) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()

# ProtoMemberAccessOp :: Exprs -> MemberNames -> ProtoMemberAccessOp
class @ProtoMemberAccessOp
  constructor: (@expr, @memberName) ->
  toJSON: exports.MemberAccessOp::toJSON

# Regexp :: string -> Regexp
class @Regexp
  constructor: (@data) ->
  toJSON: primitiveToJSON

# RemOp :: Exprs -> Exprs -> RemOp
class @RemOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Rest :: Exprs -> Rest
class @Rest
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Return :: Exprs -> Return
class @Return
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# SeqOp :: Exprs -> Exprs -> SeqOp
class @SeqOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ShallowCopyArray :: Exprs -> ShallowCopyArray
class @ShallowCopyArray
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# SignedRightShiftOp :: Exprs -> Exprs -> SignedRightShiftOp
class @SignedRightShiftOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# SoakedDynamicMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicMemberAccessOp
class @SoakedDynamicMemberAccessOp
  constructor: (@expr, @indexingExpr) ->
  toJSON: exports.DynamicMemberAccessOp::toJSON

# we don't currently support this, but for consistency we should
# SoakedDynamicProtoMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicProtoMemberAccessOp
class @SoakedDynamicProtoMemberAccessOp
  constructor: (@expr, @indexingExpr) ->
  toJSON: exports.DynamicMemberAccessOp::toJSON

# SoakedFunctionApplication :: Exprs -> [Arguments] -> SoakedFunctionApplication
class @SoakedFunctionApplication
  constructor: (@function, @arguments) ->
  toJSON: exports.FunctionApplication::toJSON

# SoakedMemberAccessOp :: Exprs -> MemberNames -> SoakedMemberAccessOp
class @SoakedMemberAccessOp
  constructor: (@expr, @memberName) ->
  toJSON: exports.MemberAccessOp::toJSON

# we don't currently support this, but for consistency we should
# SoakedProtoMemberAccessOp :: Exprs -> MemberNames -> SoakedProtoMemberAccessOp
class @SoakedProtoMemberAccessOp
  constructor: (@expr, @memberName) ->
  toJSON: exports.MemberAccessOp::toJSON

# Splice :: Slices -> Exprs -> Splice
class @Splice
  constructor: (@slice, @expr) ->
  toJSON: ->
    nodeType: @className
    slice: @slice.toJSON()
    expression: @expr.toJSON()

# Spread :: Exprs -> Spread
class @Spread
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# String :: string -> String
class @String
  constructor: (@data) ->
  toJSON: primitiveToJSON

# SubtractOp :: Exprs -> Exprs -> SubtractOp
class @SubtractOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Super :: [Arguments] -> Super
class @Super
  constructor: (@arguments) ->
  toJSON: ->
    nodeType: @className
    arguments: (a.toJSON() for a in @arguments)

# Switch :: Exprs -> [(Exprs, Block)] -> Maybe Block -> Switch
class @Switch
  constructor: (@expr, @cases, @elseBlock) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    cases: for [expr, block] in @cases
      [expr.toJSON(), block.toJSON()]
    elseBlock: @elseBlock?.toJSON()

# Throw :: Exprs -> Throw
class @Throw
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Try :: Block -> Maybe Assignable -> Maybe Block -> Maybe Block -> Try
class @Try
  constructor: (@block, @catchAssignee, @catchBlock, @finallyBlock) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()
    catchAssignee: @catchAssignee?.toJSON()
    catchBlock: @catchBlock?.toJSON()
    finallyBlock: @finallyBlock?.toJSON()

# TypeofOp :: Exprs -> TypeofOp
class @TypeofOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryExistsOp :: Exprs -> UnaryExistsOp
class @UnaryExistsOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryNegateOp :: Exprs -> UnaryNegateOp
class @UnaryNegateOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryPlusOp :: Exprs -> UnaryPlusOp
class @UnaryPlusOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnboundedLeftSlice :: Exprs -> Exprs -> UnboundedLeftSlice
class @UnboundedLeftSlice
  constructor: (@expr, @til) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    til: @til.toJSON()

# UnboundedRightSlice :: Exprs -> Exprs -> UnboundedRightSlice
class @UnboundedRightSlice
  constructor: (@expr, @from) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    from: @from.toJSON()

# Undefined :: Undefined
class @Undefined
  constructor: ->
  toJSON: statementToJSON

# UnsignedRightShiftOp :: Exprs -> Exprs -> UnsignedRightShiftOp
class @UnsignedRightShiftOp
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# While :: Exprs -> Block -> While
class @While
  constructor: (@condition, @block) ->
  toJSON: ->
    nodeType: @className
    condition: @condition.toJSON()
    block: @block.toJSON()

exports[klass].prototype.className = klass for klass, body of exports
