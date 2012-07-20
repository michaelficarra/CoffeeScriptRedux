{map, concat, concatMap, difference, nub, union} = require './functional-helpers'
exports = module?.exports ? this

# TODO: stop reusing AssignOp and make a DefaultOp for use in param lists; that was a bad idea in the first place and you should be ashamed
# TODO: make sure all the type signatures are correct

allNodes = {}

createNodes = (subclasses, superclasses = []) ->
  for own className, specs of subclasses then do (className) ->

    superclass = superclasses[0] ? ->
    isCategory = specs? and specs.length is 2
    params =
      if specs?
        switch specs.length
          when 0 then []
          when 1, 2 then specs[0]
      else null
    params ?= superclass::childNodes ? []

    klass = class extends superclass
      constructor:
        if isCategory then ->
        else ->
          for param, i in params
            @[param] = arguments[i]
          @initialise?.apply this, arguments
          this
      className: className
      @superclasses = superclasses
    if specs?[0]? then klass::childNodes = specs[0]

    allNodes[className] = klass
    if isCategory then createNodes specs[1], [klass, superclasses...]
    else exports[className] = klass

  return


createNodes
  Nodes: [ [],

    BinOps: [ ['left', 'right'],
      AssignOps: [ ['assignee', 'expression'],
        # AssignOp :: Assignables -> Exprs -> AssignOp
        AssignOp: null
        # ClassProtoAssignOp :: ObjectInitialiserKeys -> Exprs -> ClassProtoAssignOp
        ClassProtoAssignOp: null
        # CompoundAssignOp :: CompoundAssignableOps -> Assignables -> Exprs -> CompoundAssignOp
        CompoundAssignOp: [['op', 'assignee', 'expression']]
        # ExistsAssignOp :: Assignables -> Exprs -> ExistsAssignOp
        ExistsAssignOp: null
      ]
      BitOps: [ null
        BitAndOp: null # BitAndOp :: Exprs -> Exprs -> BitAndOp
        BitOrOp: null # BitOrOp :: Exprs -> Exprs -> BitOrOp
        BitXorOp: null # BitXorOp :: Exprs -> Exprs -> BitXorOp
        LeftShiftOp: null # LeftShiftOp :: Exprs -> Exprs -> LeftShiftOp
        SignedRightShiftOp: null # SignedRightShiftOp :: Exprs -> Exprs -> SignedRightShiftOp
        UnsignedRightShiftOp: null # UnsignedRightShiftOp :: Exprs -> Exprs -> UnsignedRightShiftOp
      ]
      ComparisonOps: [ null
        EQOp: null # EQOp :: Exprs -> Exprs -> EQOp
        GTEOp: null # GTEOp :: Exprs -> Exprs -> GTEOp
        GTOp: null # GTOp :: Exprs -> Exprs -> GTOp
        LTEOp: null # LTEOp :: Exprs -> Exprs -> LTEOp
        LTOp: null # LTOp :: Exprs -> Exprs -> LTOp
        NEQOp: null # NEQOp :: Exprs -> Exprs -> NEQOp
      ]
      # Note: A tree of ConcatOp represents interpolation
      ConcatOp: null # ConcatOp :: Exprs -> Exprs -> ConcatOp
      ExistsOp: null # ExistsOp :: Exprs -> Exprs -> ExistsOp
      ExtendsOp: null # ExtendsOp :: Exprs -> Exprs -> ExtendsOp
      InOp: null # InOp :: Exprs -> Exprs -> InOp
      InstanceofOp: null # InstanceofOp :: Exprs -> Exprs -> InstanceofOp
      LogicalOps: [ null
        LogicalAndOp: null # LogicalAndOp :: Exprs -> Exprs -> LogicalAndOp
        LogicalOrOp: null # LogicalOrOp :: Exprs -> Exprs -> LogicalOrOp
      ]
      MathsOps: [ null
        DivideOp: null # DivideOp :: Exprs -> Exprs -> DivideOp
        MultiplyOp: null # MultiplyOp :: Exprs -> Exprs -> MultiplyOp
        RemOp: null # RemOp :: Exprs -> Exprs -> RemOp
        SubtractOp: null # SubtractOp :: Exprs -> Exprs -> SubtractOp
      ]
      OfOp: null # OfOp :: Exprs -> Exprs -> OfOp
      PlusOp: null # PlusOp :: Exprs -> Exprs -> PlusOp
      Range: [['isInclusive', 'left', 'right']] # Range :: bool -> Exprs -> Exprs -> Range
      SeqOp: null # SeqOp :: Exprs -> Exprs -> SeqOp
    ]

    Statements: [ [],
      Break: null # Break :: Break
      Continue: null # Continue :: Continue
      Return: [['expression']] # Return :: Exprs -> Return
      Throw: [['expression']] # Throw :: Exprs -> Throw
    ]

    UnaryOps: [ ['expression'],
      BitNotOp: null # BitNotOp :: Exprs -> BitNotOp
      DeleteOp: null # DeleteOp :: MemberAccessOps -> DeleteOp
      DoOp: null # DoOp :: Exprs -> DoOp
      LogicalNotOp: null # LogicalNotOp :: Exprs -> LogicalNotOp
      NewOp: [['constructor', 'arguments']] # NewOp :: Exprs -> [Arguments] -> NewOp
      PreDecrementOp: null # PreDecrementOp :: Exprs -> PreDecrementOp
      PreIncrementOp: null # PreIncrementOp :: Exprs -> PreIncrementOp
      PostDecrementOp: null # PostDecrementOp :: Exprs -> PostDecrementOp
      PostIncrementOp: null # PostIncrementOp :: Exprs -> PostIncrementOp
      TypeofOp: null # TypeofOp :: Exprs -> TypeofOp
      UnaryExistsOp: null # UnaryExistsOp :: Exprs -> UnaryExistsOp
      UnaryNegateOp: null # UnaryNegateOp :: Exprs -> UnaryNegateOp
      UnaryPlusOp: null # UnaryPlusOp :: Exprs -> UnaryPlusOp
    ]

    MemberAccessOps: [ null
      StaticMemberAccessOps: [ ['expression', 'memberName'],
        # MemberAccessOp :: Exprs -> MemberNames -> MemberAccessOp
        MemberAccessOp: null
        # ProtoMemberAccessOp :: Exprs -> MemberNames -> ProtoMemberAccessOp
        ProtoMemberAccessOp: null
        # SoakedMemberAccessOp :: Exprs -> MemberNames -> SoakedMemberAccessOp
        SoakedMemberAccessOp: null
        # SoakedProtoMemberAccessOp :: Exprs -> MemberNames -> SoakedProtoMemberAccessOp
        SoakedProtoMemberAccessOp: null
      ]
      DynamicMemberAccessOps: [ ['expression', 'indexingExpr'],
        # DynamicMemberAccessOp :: Exprs -> Exprs -> DynamicMemberAccessOp
        DynamicMemberAccessOp: null
        # DynamicProtoMemberAccessOp :: Exprs -> Exprs -> DynamicProtoMemberAccessOp
        DynamicProtoMemberAccessOp: null
        # SoakedDynamicMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicMemberAccessOp
        SoakedDynamicMemberAccessOp: null
        # SoakedDynamicProtoMemberAccessOp :: Exprs -> Exprs -> SoakedDynamicProtoMemberAccessOp
        SoakedDynamicProtoMemberAccessOp: null
      ]
    ]

    FunctionApplications: [ ['function', 'arguments'],
      # FunctionApplication :: Exprs -> [Arguments] -> FunctionApplication
      FunctionApplication: null
      # SoakedFunctionApplication :: Exprs -> [Arguments] -> SoakedFunctionApplication
      SoakedFunctionApplication: null
    ]
    # Super :: [Arguments] -> Super
    Super: [['arguments']]

    # Program :: Maybe Exprs -> Program
    Program: [['block']]
    # Block :: [Statement] -> Block
    Block: [['statements']]
    # Conditional :: Exprs -> Maybe Exprs -> Maybe Exprs -> Conditional
    Conditional: [['condition', 'block', 'elseBlock']]
    # ForIn :: Assignable -> Maybe Assignable -> Exprs -> Exprs -> Maybe Exprs -> Maybe Exprs -> ForIn
    ForIn: [['valAssignee', 'keyAssignee', 'expression', 'step', 'filterExpr', 'block']]
    # ForOf :: bool -> Assignable -> Maybe Assignable -> Exprs -> Maybe Exprs -> Maybe Exprs -> ForOf
    ForOf: [['isOwn', 'keyAssignee', 'valAssignee', 'expression', 'filterExpr', 'block']]
    # Switch :: Maybe Exprs -> [SwitchCase] -> Maybe Exprs -> Switch
    Switch: [['expression', 'cases', 'elseBlock']]
    # SwitchCase :: [Exprs] -> Maybe Expr -> SwitchCase
    SwitchCase: [['conditions', 'block']]
    # Try :: Exprs -> Maybe Assignable -> Maybe Exprs -> Maybe Exprs -> Try
    Try: [['block', 'catchAssignee', 'catchBlock', 'finallyBlock']]
    # While :: Exprs -> Maybe Exprs -> While
    While: [['condition', 'block']]

    # ArrayInitialiser :: [ArrayInitialiserMembers] -> ArrayInitialiser
    ArrayInitialiser: [['members']]
    # ObjectInitialiser :: [(ObjectInitialiserKeys, Exprs)] -> ObjectInitialiser
    ObjectInitialiser: [['members']]
    # Class:: Maybe Assignable -> Maybe Exprs -> Maybe Exprs -> Class
    Class: ['nameAssignment', 'parent', 'block']
    Functions: [ ['parameters', 'block'],
      Function: null # Function :: [Parameters] -> Maybe Exprs -> Function
      BoundFunction: null # BoundFunction :: [Parameters] -> Maybe Exprs -> BoundFunction
    ]
    Identifiers: [ ['data'],
      Identifier: null # Identifier :: string -> Identifier
      GenSym: [['data', 'ns']] # GenSym :: string -> string -> GenSym
    ]
    Null: null # Null :: Null
    Primitives: [ ['data'],
      Bool: null # Bool :: bool -> Bool
      JavaScript: null # JavaScript :: string -> JavaScript
      Numbers: [ null,
        Int: null # Int :: float -> Int
        Float: null # Float :: float -> Float
      ]
      String: null # String :: string -> String
    ]
    RegExps: [ null
      # RegExp :: string -> [string] -> RegExp
      RegExp: [['data', 'flags']]
      # HeregExp :: Exprs -> [string] -> HeregExp
      HeregExp: [['expression', 'flags']]
    ]
    This: null # This :: This
    Undefined: null # Undefined :: Undefined

    # Slice :: Exprs -> bool -> Maybe Exprs -> Maybe Exprs -> Slice
    Slice: [['expression', 'isInclusive', 'left', 'right']]

    Rest: [['expression']] # Rest :: Exprs -> Rest
    Spread: [['expression']] # Spread :: Exprs -> Spread
  ]


{
  Nodes, Primitives, CompoundAssignOp, StaticMemberAccessOps, Range,
  ArrayInitialiser, ObjectInitialiser, NegatedConditional, Conditional,
  Identifier, ForOf, Functions, While, GenSym, Class, Block, NewOp,
  FunctionApplications, RegExps, RegExp, HeregExp, Super, Slice, Switch,
  Identifiers, SwitchCase
} = allNodes

Nodes.fromJSON = (json) -> exports[json.nodeType].fromJSON json
Nodes::toJSON = ->
  json = nodeType: @className
  for child in @childNodes
    json[child] = @[child]?.toJSON()
  json
Nodes::fmap = (memo, fn) ->
  for child in @childNodes
    memo = @[child].fmap memo, fn
  fn memo, this
Nodes::instanceof = (ctors...) ->
  # not a fold for efficiency's sake
  for ctor in ctors when @className is ctor::className
    return yes
  no
#Node::r = (@raw) -> this
Nodes::r = -> this
Nodes::p = (@line, @column) -> this
Nodes::generated = no
Nodes::g = ->
  @generated = yes
  this


## Nodes that contain primitive properties

handlePrimitives = (ctor, primitives) ->
  ctor::childNodes = difference ctor::childNodes, primitives
  ctor::toJSON = ->
    json = Nodes::toJSON.call this
    for primitive in primitives
      json[primitive] = @[primitive]
    json

handlePrimitives Class, ['name']
handlePrimitives ForOf, ['isOwn']
handlePrimitives HeregExp, ['flags']
handlePrimitives Identifiers, ['data']
handlePrimitives Primitives, ['data']
handlePrimitives Range, ['isInclusive']
handlePrimitives RegExp, ['data', 'flags']
handlePrimitives Slice, ['isInclusive']
handlePrimitives StaticMemberAccessOps, ['memberName']

# TODO: change constructor reference to a simple className reference?
CompoundAssignOp::childNodes = difference CompoundAssignOp::childNodes, ['op']
CompoundAssignOp::toJSON = ->
  json = Nodes::toJSON.call this
  json.op = @op::className
  json


## Nodes that contain list properties

handleLists = (ctor, listProps) ->
  ctor::childNodes = difference ctor::childNodes, listProps
  ctor::toJSON = ->
    json = Nodes::toJSON.call this
    for listProp in listProps
      json[listProp] = (p.toJSON() for p in @[listProp])
    json

handleLists ArrayInitialiser, ['members']
handleLists Block, ['statements']
handleLists Functions, ['parameters']
handleLists FunctionApplications, ['arguments']
handleLists NewOp, ['arguments']
handleLists Super, ['arguments']
handleLists Switch, ['cases']
handleLists SwitchCase, ['conditions']

# TODO: same idea as with Switch: make `members` a list of ObjectInitialiserMapping
ObjectInitialiser::childNodes = []
ObjectInitialiser::toJSON = ->
  json = Nodes::toJSON.call this
  json.members = for [key, expr] in @members
    [key.toJSON(), expr.toJSON()]
  json



## Nodes with special behaviours

Block.wrap = (s) -> new Block(if s? then [s] else []).r(s.raw).p(s.line, s.column)

Class::initialise = ->
  @name =
    if @nameAssignment?
      # poor man's pattern matching
      switch @nameAssignment.className
        when Identifier::className
          @nameAssignment.data
        when MemberAccessOp::className, ProtoMemberAccessOp::className, SoakedMemberAccessOp::className, SoakedProtoMemberAccessOp::className
          @nameAssignment.memberName
        else null
    else null

GenSym::initialise = (_, @ns = '') ->

ObjectInitialiser::keys = -> map @members ([key, val]) -> key
ObjectInitialiser::vals = -> map @members ([key, val]) -> val

RegExps::initialise = (_, flags) ->
  @flags = {}
  for flag in ['g', 'i', 'm', 'y']
    @flags[flag] = flag in flags


## Syntactic nodes

# Note: This only represents the original syntactic specification as an
# "unless". The node should be treated in all other ways as a Conditional.
# NegatedConditional :: Exprs -> Maybe Exprs -> Maybe Exprs -> NegatedConditional
class exports.NegatedConditional extends Conditional

# Note: This only represents the original syntactic specification as an
# "until". The node should be treated in all other ways as a While.
# NegatedWhile :: Exprs -> Maybe Exprs -> NegatedWhile
class exports.NegatedWhile extends While

# Note: This only represents the original syntactic specification as a "loop".
# The node should be treated in all other ways as a While.
# Loop :: Maybe Exprs -> Loop
class exports.Loop extends While
  constructor: (block) -> super (new Bool true).g(), block
