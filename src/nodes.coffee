# AddOp :: Exprs -> Exprs -> AddOp
class exports.AddOp
  constructor: (@left, @right) ->

# AndOp :: Exprs -> Exprs -> AndOp
class exports.AndOp
  constructor: (@left, @right) ->

# ArrayInitialiser :: [ArrayInitialiserMembers] -> ArrayInitialiser
class exports.ArrayInitialiser
  constructor: (@exprs) ->

# AssignOp :: Assignables -> Exprs -> AssignOp
class exports.AssignOp
  constructor: (@assignee, @expr) ->

# BitAndOp :: Exprs -> Exprs -> BitAndOp
class exports.BitAndOp
  constructor: (@left, @right) ->

# BitNotOp :: Exprs -> BitNotOp
class exports.BitNotOp
  constructor: (@expr) ->

# BitOrOp :: Exprs -> Exprs -> BitOrOp
class exports.BitOrOp
  constructor: (@left, @right) ->

# BitXorOp :: Exprs -> Exprs -> BitXorOp
class exports.BitXorOp
  constructor: (@left, @right) ->

# Block :: [Statement] -> Block
class exports.Block
  constructor: (@statements) ->

# Bool :: bool -> Bool
class exports.Bool
  constructor: (@data) ->

# BoundFunction :: [Parameters] -> Block -> BoundFunction
class exports.BoundFunction
  constructor: (@parameters, @block) ->

# Break :: Break
class exports.Break
  constructor: ->

# class exports.:: Maybe Assignable -> Maybe Exprs -> [Exprs] -> Class
class exports.Class
  constructor: (@nameAssignment, @parent, @exprs) ->

# ClassProtoAssignOp :: MemberNames -> Exprs -> ClassProtoAssignOp
class exports.ClassProtoAssignOp
  constructor: (@memberName, @expr) ->

# CompoundAssignOp :: CompoundAssignableOps -> Assignables -> Exprs -> CompoundAssignOp
class exports.CompoundAssignOp
  constructor: (@op, @assignee, @expr) ->

# a tree of ConcatOp represents interpolation
# ConcatOp :: Exprs -> Exprs -> ConcatOp
class exports.ConcatOp
  constructor: (@left, @right) ->

# Conditional :: Exprs -> Block -> Maybe Block -> Conditional
class exports.Conditional
  constructor: (@condition, @block, @elseBlock) ->

# Continue :: Continue
class exports.Continue
  constructor: ->

# DecrementOp :: Exprs -> DecrementOp
class exports.DecrementOp
  constructor: (@expr) ->

# DivideOp :: Exprs -> Exprs -> DivideOp
class exports.DivideOp
  constructor: (@left, @right) ->

# DoOp :: Exprs -> DoOp
class exports.DoOp
  constructor: (@expr) ->

# DynamicMemberAccessOp :: Exprs -> Exprs -> DynamicMemberAccessOp
class exports.DynamicMemberAccessOp
  constructor: (@expr, @indexingExpr) ->

# DynamicProtoMemberAccessOp :: Exprs -> Exprs -> DynamicProtoMemberAccessOp
class exports.DynamicProtoMemberAccessOp
  constructor: (@expr, @indexingExpr) ->

# EQOp :: Exprs -> Exprs -> EQOp
class exports.EQOp
  constructor: (@left, @right) ->

# ExclusiveRange :: Exprs -> Exprs -> ExclusiveRange
class exports.ExclusiveRange
  constructor: (@from, @til) ->

# ExclusiveSlice :: Exprs -> Exprs -> Exprs -> ExclusiveSlice
class exports.ExclusiveSlice
  constructor: (@expr, @from, @til) ->

# ExistsAssignOp :: Assignables -> Exprs -> ExistsAssignOp
class exports.ExistsAssignOp
  constructor: (@assignee, @expr) ->

# ExistsOp :: Exprs -> Exprs -> ExistsOp
class exports.ExistsOp
  constructor: (@left, @right) ->

# ExtendsOp :: Exprs -> Exprs -> ExtendsOp
class exports.ExtendsOp
  constructor: (@left, @right) ->

# Float :: float -> Float
class exports.Float
  constructor: (@data) ->

# ForIn :: Assignable -> Maybe Assignable -> Exprs -> Exprs -> Block -> ForIn
class exports.ForIn
  constructor: (@valAssignee, @keyAssignee, @expr, @filterExpr, @block) ->

# ForOf :: bool -> Assignable -> Maybe Assignable -> Exprs -> Exprs -> Block -> ForOf
class exports.ForOf
  constructor: (@isOwn, @keyAssignee, @valAssignee, @expr, @filterExpr, @block) ->

# Function :: [Parameters] -> Block -> Function
class exports.Function
  constructor: (@parameters, @block) ->

# FunctionApplication :: Exprs -> [Arguments] -> FunctionApplication
class exports.FunctionApplication
  constructor: (@function, @arguments) ->

# GTEOp :: Exprs -> Exprs -> GTEOp
class exports.GTEOp
  constructor: (@left, @right) ->

# GTOp :: Exprs -> Exprs -> GTOp
class exports.GTOp
  constructor: (@left, @right) ->

# InOp :: Exprs -> Exprs -> InOp
class exports.InOp
  constructor: (@left, @right) ->

# InclusiveRange :: Exprs -> Exprs -> InclusiveRange
class exports.InclusiveRange
  constructor: (@from, @to) ->

# InclusiveSlice :: Exprs -> Exprs -> Exprs -> InclusiveSlice
class exports.InclusiveSlice
  constructor: (@expr, @from, @to) ->

# IncrementOp :: Exprs -> IncrementOp
class exports.IncrementOp
  constructor: (@expr) ->

# InstanceofOp :: Exprs -> Exprs -> InstanceofOp
class exports.InstanceofOp
  constructor: (@left, @right) ->

# Int :: float -> Int
class exports.Int
  constructor: (@data) ->

# JavaScript :: string -> JavaScript
class exports.JavaScript
  constructor: (@data) ->

# LTEOp :: Exprs -> Exprs -> LTEOp
class exports.LTEOp
  constructor: (@left, @right) ->

# LTOp :: Exprs -> Exprs -> LTOp
class exports.LTOp
  constructor: (@left, @right) ->

# LeftShiftOp :: Exprs -> Exprs -> LeftShiftOp
class exports.LeftShiftOp
  constructor: (@left, @right) ->

# MemberAccessOp :: Exprs -> MemberNames -> MemberAccessOp
class exports.MemberAccessOp
  constructor: (@expr, @memberName) ->

# MultiplyOp :: Exprs -> Exprs -> MultiplyOp
class exports.MultiplyOp
  constructor: (@left, @right) ->

# NEQOp :: Exprs -> Exprs -> NEQOp
class exports.NEQOp
  constructor: (@left, @right) ->

# NewOp :: Exprs -> NewOp
class exports.NewOp
  constructor: (@expr) ->

# NotOp :: Exprs -> NotOp
class exports.NotOp
  constructor: (@expr) ->

# Null :: Null
class exports.Null
  constructor: ->

# ObjectInitialiser :: [(ObjectInitialiserKeys, Exprs)] -> ObjectInitialiser
class exports.ObjectInitialiser
  constructor: (@assignments) ->

# OfOp :: Exprs -> Exprs -> OfOp
class exports.OfOp
  constructor: (@left, @right) ->

# OrOp :: Exprs -> Exprs -> OrOp
class exports.OrOp
  constructor: (@left, @right) ->

# PostDecrementOp :: Exprs -> PostDecrementOp
class exports.PostDecrementOp
  constructor: (@expr) ->

# PostIncrementOp :: Exprs -> PostIncrementOp
class exports.PostIncrementOp
  constructor: (@expr) ->

# Program :: Block -> Program
class exports.Program
  constructor: (@block) ->

# ProtoMemberAccessOp :: Exprs -> MemberNames -> ProtoMemberAccessOp
class exports.ProtoMemberAccessOp
  constructor: (@expr, @memberName) ->

# Regexp :: string -> Regexp
class exports.Regexp
  constructor: (@data) ->

# RemOp :: Exprs -> Exprs -> RemOp
class exports.RemOp
  constructor: (@left, @right) ->

# Rest :: Exprs -> Rest
class exports.Rest
  constructor: (@expr) ->

# Return :: Exprs -> Return
class exports.Return
  constructor: (@expr) ->

# SeqOp :: Exprs -> Exprs -> SeqOp
class exports.SeqOp
  constructor: (@left, @right) ->

# ShallowCopyArray :: Exprs -> ShallowCopyArray
class exports.ShallowCopyArray
  constructor: (@expr) ->

# SignedRightShiftOp :: Exprs -> Exprs -> SignedRightShiftOp
class exports.SignedRightShiftOp
  constructor: (@left, @right) ->

# SoakedDynamicMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicMemberAccessOp
class exports.SoakedDynamicMemberAccessOp
  constructor: (@expr, @indexingExpr) ->

# we don't currently support this, but for consistency we should
# SoakedDynamicProtoMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicProtoMemberAccessOp
class exports.SoakedDynamicProtoMemberAccessOp
  constructor: (@expr, @indexingExpr) ->

# SoakedFunctionApplication :: Exprs -> [Arguments] -> SoakedFunctionApplication
class exports.SoakedFunctionApplication
  constructor: (@function, @arguments) ->

# SoakedMemberAccessOp :: Exprs -> MemberNames -> SoakedMemberAccessOp
class exports.SoakedMemberAccessOp
  constructor: (@expr, @memberName) ->

# we don't currently support this, but for consistency we should
# SoakedProtoMemberAccessOp :: Exprs -> MemberNames -> SoakedProtoMemberAccessOp
class exports.SoakedProtoMemberAccessOp
  constructor: (@expr, @memberName) ->

# Splice :: Slices -> Exprs -> Splice
class exports.Splice
  constructor: (@slice, @expr) ->

# Spread :: Exprs -> Spread
class exports.Spread
  constructor: (@expr) ->

# String :: string -> String
class exports.String
  constructor: (@data) ->

# SubtractOp :: Exprs -> Exprs -> SubtractOp
class exports.SubtractOp
  constructor: (@left, @right) ->

# Super :: [Arguments] -> Super
class exports.Super
  constructor: (@arguments) ->

# Switch :: Exprs -> [(Exprs, Block)] -> Maybe Block -> Switch
class exports.Switch
  constructor: (@expr, @cases, @elseBlock) ->

# Throw :: Exprs -> Throw
class exports.Throw
  constructor: (@expr) ->

# Try :: Block -> Maybe Assignable -> Maybe Block -> Maybe Block -> Try
class exports.Try
  constructor: (@block, @catchAssignee, @catchBlock, @finallBlock) ->

# TypeofOp :: Exprs -> TypeofOp
class exports.TypeofOp
  constructor: (@expr) ->

# UnaryExistsOp :: Exprs -> UnaryExistsOp
class exports.UnaryExistsOp
  constructor: (@expr) ->

# UnaryNegateOp :: Exprs -> UnaryNegateOp
class exports.UnaryNegateOp
  constructor: (@expr) ->

# UnaryPlusOp :: Exprs -> UnaryPlusOp
class exports.UnaryPlusOp
  constructor: (@expr) ->

# UnboundedLeftSlice :: Exprs -> Exprs -> UnboundedLeftSlice
class exports.UnboundedLeftSlice
  constructor: (@expr, @til) ->

# UnboundedRightSlice :: Exprs -> Exprs -> UnboundedRightSlice
class exports.UnboundedRightSlice
  constructor: (@expr, @from) ->

# Undefined :: Undefined
class exports.Undefined
  constructor: ->

# UnsignedRightShiftOp :: Exprs -> Exprs -> UnsignedRightShiftOp
class exports.UnsignedRightShiftOp
  constructor: (@left, @right) ->

# While :: Exprs -> Block -> While
class exports.While
  constructor: (@condition, @block) ->
