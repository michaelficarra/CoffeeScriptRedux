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
  ndoeType: @className
  data: @data


# AddOp :: Exprs -> Exprs -> AddOp
class @AddOp
  className: "AddOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ArrayInitialiser :: [ArrayInitialiserMembers] -> ArrayInitialiser
class @ArrayInitialiser
  className: "ArrayInitialiser"
  constructor: (@exprs) ->
  toJSON: ->
    nodeType: @className
    expressions: (e.toJSON() for e in @exprs)

# AssignOp :: Assignables -> Exprs -> AssignOp
class @AssignOp
  className: "AssignOp"
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# BitAndOp :: Exprs -> Exprs -> BitAndOp
class @BitAndOp
  className: "BitAndOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# BitNotOp :: Exprs -> BitNotOp
class @BitNotOp
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# BitOrOp :: Exprs -> Exprs -> BitOrOp
class @BitOrOp
  className: "BitOrOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# BitXorOp :: Exprs -> Exprs -> BitXorOp
class @BitXorOp
  className: "BitXorOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Block :: [Statement] -> Block
class @Block
  className: "Block"
  constructor: (@statements) ->
  toJSON: ->
    nodeType: @className
    statements: @statements.toJSON()

# Bool :: bool -> Bool
class @Bool
  className: "Bool"
  constructor: (@data) ->
  toJSON: primitiveToJSON

# BoundFunction :: [Parameters] -> Block -> BoundFunction
class @BoundFunction
  className: "BoundFunction"
  constructor: (@parameters, @block) ->
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block.toJSON()

# Break :: Break
class @Break
  className: "Break"
  constructor: ->
  toJSON: statementToJSON

# class @:: Maybe Assignable -> Maybe Exprs -> [Exprs] -> Class
class @Class
  className: "Class"
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
  className: "ClassProtoAssignOp"
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# CompoundAssignOp :: CompoundAssignableOps -> Assignables -> Exprs -> CompoundAssignOp
class @CompoundAssignOp
  className: "CompoundAssignOp"
  constructor: (@op, @assignee, @expr) ->
  toJSON: ->
    nodeType: @className
    op: @op::className
    assignee: @assignee.toJSON()
    expression: @expr.toJSON()

# a tree of ConcatOp represents interpolation
# ConcatOp :: Exprs -> Exprs -> ConcatOp
class @ConcatOp
  className: "ConcatOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Conditional :: Exprs -> Block -> Maybe Block -> Conditional
class @Conditional
  className: "Conditional"
  constructor: (@condition, @block, @elseBlock) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()
    elseBlock: @elseBlock?.toJSON()

# Continue :: Continue
class @Continue
  className: "Continue"
  constructor: ->
  toJSON: statementToJSON

# DivideOp :: Exprs -> Exprs -> DivideOp
class @DivideOp
  className: "DivideOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# DoOp :: Exprs -> DoOp
class @DoOp
  className: "DoOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# DynamicMemberAccessOp :: Exprs -> Exprs -> DynamicMemberAccessOp
class @DynamicMemberAccessOp
  className: "DynamicMemberAccessOp"
  constructor: (@expr, @indexingExpr) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    indexingExpression: @indexingExpr.toJSON()

# DynamicProtoMemberAccessOp :: Exprs -> Exprs -> DynamicProtoMemberAccessOp
class @DynamicProtoMemberAccessOp
  className: "DynamicProtoMemberAccessOp"
  constructor: (@expr, @indexingExpr) ->
  toJSON: exports.DynamicMemberAccessOp::toJSON

# EQOp :: Exprs -> Exprs -> EQOp
class @EQOp
  className: "EQOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ExclusiveRange :: Exprs -> Exprs -> ExclusiveRange
class @ExclusiveRange
  className: "ExclusiveRange"
  constructor: (@from, @til) ->
  toJSON: ->
    nodeType: @className
    from: @from.toJSON()
    til: @til.toJSON()

# ExclusiveSlice :: Exprs -> Exprs -> Exprs -> ExclusiveSlice
class @ExclusiveSlice
  className: "ExclusiveSlice"
  constructor: (@expr, @from, @til) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    from: @from.toJSON()
    til: @til.toJSON()

# ExistsAssignOp :: Assignables -> Exprs -> ExistsAssignOp
class @ExistsAssignOp
  className: "ExistsAssignOp"
  constructor: (@assignee, @expr) ->
  toJSON: assignOpToJSON

# ExistsOp :: Exprs -> Exprs -> ExistsOp
class @ExistsOp
  className: "ExistsOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ExtendsOp :: Exprs -> Exprs -> ExtendsOp
class @ExtendsOp
  className: "ExtendsOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Float :: float -> Float
class @Float
  className: "Float"
  constructor: (@data) ->
  toJSON: primitiveToJSON

# ForIn :: Assignable -> Maybe Assignable -> Exprs -> Exprs -> Block -> ForIn
class @ForIn
  className: "ForIn"
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
  className: "ForOf"
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
  className: "Function"
  constructor: (@parameters, @block) ->
  toJSON: ->
    nodeType: @className
    parameters: (p.toJSON() for p in @parameters)
    block: @block.toJSON()

# FunctionApplication :: Exprs -> [Arguments] -> FunctionApplication
class @FunctionApplication
  className: "FunctionApplication"
  constructor: (@function, @arguments) ->
  toJSON: ->
    nodeType: @className
    function: @function.toJSON()
    arguments: (a.toJSON() for a in @arguments)

# GTEOp :: Exprs -> Exprs -> GTEOp
class @GTEOp
  className: "GTEOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# GTOp :: Exprs -> Exprs -> GTOp
class @GTOp
  className: "GTOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Identifier :: string -> Identifier
class @Identifier
  className: "Identifier"
  constructor: (@data) ->
  toJSON: primitiveToJSON

# InOp :: Exprs -> Exprs -> InOp
class @InOp
  className: "InOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# InclusiveRange :: Exprs -> Exprs -> InclusiveRange
class @InclusiveRange
  className: "InclusiveRange"
  constructor: (@from, @to) ->
  toJSON: ->
    nodeType: @className
    from: @from.toJSON()
    to: @to.toJSON()

# InclusiveSlice :: Exprs -> Exprs -> Exprs -> InclusiveSlice
class @InclusiveSlice
  className: "InclusiveSlice"
  constructor: (@expr, @from, @to) ->
  toJSON: ->
    nodeType: @className
    expression: @expression.toJSON()
    from: @from.toJSON()
    to: @to.toJSON()

# InstanceofOp :: Exprs -> Exprs -> InstanceofOp
class @InstanceofOp
  className: "InstanceofOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Int :: float -> Int
class @Int
  className: "Int"
  constructor: (@data) ->
  toJSON: primitiveToJSON

# JavaScript :: string -> JavaScript
class @JavaScript
  className: "JavaScript"
  constructor: (@data) ->
  toJSON: primitiveToJSON

# LTEOp :: Exprs -> Exprs -> LTEOp
class @LTEOp
  className: "LTEOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LTOp :: Exprs -> Exprs -> LTOp
class @LTOp
  className: "LTOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LeftShiftOp :: Exprs -> Exprs -> LeftShiftOp
class @LeftShiftOp
  className: "LeftShiftOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LogicalAndOp :: Exprs -> Exprs -> LogicalAndOp
class @LogicalAndOp
  className: "LogicalAndOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# LogicalNotOp :: Exprs -> LogicalNotOp
class @LogicalNotOp
  className: "LogicalNotOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# LogicalOrOp :: Exprs -> Exprs -> LogicalOrOp
class @LogicalOrOp
  className: "LogicalOrOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# MemberAccessOp :: Exprs -> MemberNames -> MemberAccessOp
class @MemberAccessOp
  className: "MemberAccessOp"
  constructor: (@expr, @memberName) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    memberName: @memberName.toJSON()

# MultiplyOp :: Exprs -> Exprs -> MultiplyOp
class @MultiplyOp
  className: "MultiplyOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# NEQOp :: Exprs -> Exprs -> NEQOp
class @NEQOp
  className: "NEQOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# NewOp :: Exprs -> NewOp
class @NewOp
  className: "NewOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Null :: Null
class @Null
  className: "Null"
  constructor: ->
  toJSON: statementToJSON

# ObjectInitialiser :: [(ObjectInitialiserKeys, Exprs)] -> ObjectInitialiser
class @ObjectInitialiser
  className: "ObjectInitialiser"
  constructor: (@assignments) ->
  toJSON: ->
    nodeType: @className
    assignments: for [key, expr] in @assignments
      [key.toJSON(), expr.toJSON()]

# OfOp :: Exprs -> Exprs -> OfOp
class @OfOp
  className: "OfOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# PreDecrementOp :: Exprs -> PreDecrementOp
class @PreDecrementOp
  className: "PreDecrementOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PreIncrementOp :: Exprs -> PreIncrementOp
class @PreIncrementOp
  className: "PreIncrementOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PostDecrementOp :: Exprs -> PostDecrementOp
class @PostDecrementOp
  className: "PostDecrementOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# PostIncrementOp :: Exprs -> PostIncrementOp
class @PostIncrementOp
  className: "PostIncrementOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Program :: Block -> Program
class @Program
  className: "Program"
  constructor: (@block) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()

# ProtoMemberAccessOp :: Exprs -> MemberNames -> ProtoMemberAccessOp
class @ProtoMemberAccessOp
  className: "ProtoMemberAccessOp"
  constructor: (@expr, @memberName) ->
  toJSON: exports.MemberAccessOp::toJSON

# Regexp :: string -> Regexp
class @Regexp
  className: "Regexp"
  constructor: (@data) ->
  toJSON: primitiveToJSON

# RemOp :: Exprs -> Exprs -> RemOp
class @RemOp
  className: "RemOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Rest :: Exprs -> Rest
class @Rest
  className: "Rest"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Return :: Exprs -> Return
class @Return
  className: "Return"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# SeqOp :: Exprs -> Exprs -> SeqOp
class @SeqOp
  className: "SeqOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# ShallowCopyArray :: Exprs -> ShallowCopyArray
class @ShallowCopyArray
  className: "ShallowCopyArray"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# SignedRightShiftOp :: Exprs -> Exprs -> SignedRightShiftOp
class @SignedRightShiftOp
  className: "SignedRightShiftOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# SoakedDynamicMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicMemberAccessOp
class @SoakedDynamicMemberAccessOp
  className: "SoakedDynamicMemberAccessOp"
  constructor: (@expr, @indexingExpr) ->
  toJSON: exports.DynamicMemberAccessOp::toJSON

# we don't currently support this, but for consistency we should
# SoakedDynamicProtoMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicProtoMemberAccessOp
class @SoakedDynamicProtoMemberAccessOp
  className: "SoakedDynamicProtoMemberAccessOp"
  constructor: (@expr, @indexingExpr) ->
  toJSON: exports.DynamicMemberAccessOp::toJSON

# SoakedFunctionApplication :: Exprs -> [Arguments] -> SoakedFunctionApplication
class @SoakedFunctionApplication
  className: "SoakedFunctionApplication"
  constructor: (@function, @arguments) ->
  toJSON: exports.FunctionApplication::toJSON

# SoakedMemberAccessOp :: Exprs -> MemberNames -> SoakedMemberAccessOp
class @SoakedMemberAccessOp
  className: "SoakedMemberAccessOp"
  constructor: (@expr, @memberName) ->
  toJSON: exports.MemberAccessOp::toJSON

# we don't currently support this, but for consistency we should
# SoakedProtoMemberAccessOp :: Exprs -> MemberNames -> SoakedProtoMemberAccessOp
class @SoakedProtoMemberAccessOp
  className: "SoakedProtoMemberAccessOp"
  constructor: (@expr, @memberName) ->
  toJSON: exports.MemberAccessOp::toJSON

# Splice :: Slices -> Exprs -> Splice
class @Splice
  className: "Splice"
  constructor: (@slice, @expr) ->
  toJSON: ->
    nodeType: @className
    slice: @slice.toJSON()
    expression: @expr.toJSON()

# Spread :: Exprs -> Spread
class @Spread
  className: "Spread"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# String :: string -> String
class @String
  className: "String"
  constructor: (@data) ->
  toJSON: primitiveToJSON

# SubtractOp :: Exprs -> Exprs -> SubtractOp
class @SubtractOp
  className: "SubtractOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# Super :: [Arguments] -> Super
class @Super
  className: "Super"
  constructor: (@arguments) ->
  toJSON: ->
    nodeType: @className
    arguments: (a.toJSON() for a in @arguments)

# Switch :: Exprs -> [(Exprs, Block)] -> Maybe Block -> Switch
class @Switch
  className: "Switch"
  constructor: (@expr, @cases, @elseBlock) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    cases: for [expr, block] in @cases
      [expr.toJSON(), block.toJSON()]
    elseBlock: @elseBlock?.toJSON()

# Throw :: Exprs -> Throw
class @Throw
  className: "Throw"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# Try :: Block -> Maybe Assignable -> Maybe Block -> Maybe Block -> Try
class @Try
  className: "Try"
  constructor: (@block, @catchAssignee, @catchBlock, @finallyBlock) ->
  toJSON: ->
    nodeType: @className
    block: @block.toJSON()
    catchAssignee: @catchAssignee?.toJSON()
    catchBlock: @catchBlock?.toJSON()
    finallyBlock: @finallyBlock?.toJSON()

# TypeofOp :: Exprs -> TypeofOp
class @TypeofOp
  className: "TypeofOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryExistsOp :: Exprs -> UnaryExistsOp
class @UnaryExistsOp
  className: "UnaryExistsOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryNegateOp :: Exprs -> UnaryNegateOp
class @UnaryNegateOp
  className: "UnaryNegateOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnaryPlusOp :: Exprs -> UnaryPlusOp
class @UnaryPlusOp
  className: "UnaryPlusOp"
  constructor: (@expr) ->
  toJSON: unaryOpToJSON

# UnboundedLeftSlice :: Exprs -> Exprs -> UnboundedLeftSlice
class @UnboundedLeftSlice
  className: "UnboundedLeftSlice"
  constructor: (@expr, @til) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    til: @til.toJSON()

# UnboundedRightSlice :: Exprs -> Exprs -> UnboundedRightSlice
class @UnboundedRightSlice
  className: "UnboundedRightSlice"
  constructor: (@expr, @from) ->
  toJSON: ->
    nodeType: @className
    expression: @expr.toJSON()
    from: @from.toJSON()

# Undefined :: Undefined
class @Undefined
  className: "Undefined"
  constructor: ->
  toJSON: statementToJSON

# UnsignedRightShiftOp :: Exprs -> Exprs -> UnsignedRightShiftOp
class @UnsignedRightShiftOp
  className: "UnsignedRightShiftOp"
  constructor: (@left, @right) ->
  toJSON: binOpToJSON

# While :: Exprs -> Block -> While
class @While
  className: "While"
  constructor: (@condition, @block) ->
  toJSON: ->
    nodeType: @className
    condition: @condition.toJSON()
    block: @block.toJSON()
