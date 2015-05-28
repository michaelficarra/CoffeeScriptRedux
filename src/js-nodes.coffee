{difference} = require './functional-helpers'
exports = module?.exports ? this

createNode = (type, props) ->
  class extends Nodes
    constructor: ->
      this[prop] = arguments[i] for prop, i in props
    type: type
    childNodes: props

@Nodes = class Nodes
  listMembers: []
  instanceof: (ctors...) ->
    # not a fold for efficiency's sake
    for ctor in ctors when @type is ctor::type
      return yes
    no
  toBasicObject: ->
    obj = {@type}
    for child in @childNodes
      if child in @listMembers
        obj[child] = (p?.toBasicObject() for p in this[child])
      else
        obj[child] = this[child]?.toBasicObject()
    if @line? and @column?
      obj.loc = start: {@line, @column}
    if @offset?
      obj.range = [
        @offset
        if @raw? then @offset + @raw.length else undefined
      ]

    for property in ['leadingComments', 'raw', 'expression', 'generator']
      if this[property]? && property not in @childNodes
        obj[property] = this[property]
    obj

nodeData = [
  # constructor name, isStatement, construction parameters
  ['ArrayExpression'      , no , ['elements']]
  ['ArrayPattern'         , no , ['elements']]
  ['ArrowFunctionExpression',no, ['params', 'defaults', 'rest', 'body']]
  ['AssignmentExpression' , no , ['operator', 'left', 'right']]
  ['BinaryExpression'     , no , ['operator', 'left', 'right']]
  ['BlockStatement'       , yes, ['body']]
  ['BreakStatement'       , yes, ['label']]
  ['CallExpression'       , no , ['callee', 'arguments']]
  ['CatchClause'          , yes, ['param', 'body']]
  ['ClassBody'            , yes, ['body']]
  ['ClassDeclaration'     , yes, ['id', 'superClass', 'body']]
  ['ConditionalExpression', no , ['test', 'consequent', 'alternate']]
  ['ContinueStatement'    , yes, ['label']]
  ['DebuggerStatement'    , yes, []]
  ['DoWhileStatement'     , yes, ['body', 'test']]
  ['EmptyStatement'       , yes, []]
  ['ExpressionStatement'  , yes, ['expression']]
  ['ForInStatement'       , yes, ['left', 'right', 'body']]
  ['ForStatement'         , yes, ['init', 'test', 'update', 'body']]
  ['FunctionDeclaration'  , yes, ['id', 'params', 'defaults', 'rest', 'body']]
  ['FunctionExpression'   , no , ['id', 'params', 'defaults', 'rest', 'body']]
  ['GenSym'               , no , ['ns', 'uniqueId']]
  ['Identifier'           , no , ['name']]
  ['IfStatement'          , yes, ['test', 'consequent', 'alternate']]
  ['LabeledStatement'     , yes, ['label', 'body']]
  ['Literal'              , no , ['value']]
  ['LogicalExpression'    , no , ['operator', 'left', 'right']]
  ['MemberExpression'     , no , ['computed', 'object', 'property']]
  ['MethodDefinition'     , no , ['key', 'value']]
  ['NewExpression'        , no , ['callee', 'arguments']]
  ['ObjectExpression'     , no , ['properties']]
  ['Program'              , yes, ['body']]
  ['Property'             , yes, ['key', 'value']]
  ['RestElement'          , yes, ['argument']]
  ['ReturnStatement'      , yes, ['argument']]
  ['SequenceExpression'   , no , ['expressions']]
  ['SwitchCase'           , yes, ['test', 'consequent']]
  ['SwitchStatement'      , yes, ['discriminant', 'cases']]
  ['ThisExpression'       , no , []]
  ['ThrowStatement'       , yes, ['argument']]
  ['TryStatement'         , yes, ['block', 'handlers', 'finalizer']]
  ['UnaryExpression'      , no , ['operator', 'argument']]
  ['UpdateExpression'     , no , ['operator', 'prefix', 'argument']]
  ['VariableDeclaration'  , yes, ['kind', 'declarations']]
  ['VariableDeclarator'   , yes, ['id', 'init']]
  ['WhileStatement'       , yes, ['test', 'body']]
  ['WithStatement'        , yes, ['object', 'body']]
]

for [node, isStatement, params] in nodeData
  exports[node] = ctor = createNode node, params
  ctor::isStatement = isStatement
  ctor::isExpression = not isStatement


{
  Program, BlockStatement, Literal, Identifier, FunctionExpression,
  CallExpression, SequenceExpression, ArrayExpression, ArrayPattern, BinaryExpression,
  UnaryExpression, NewExpression, VariableDeclaration, ObjectExpression,
  MemberExpression, UpdateExpression, AssignmentExpression, LogicalExpression,
  GenSym, FunctionDeclaration, VariableDeclaration, SwitchStatement, SwitchCase,
  TryStatement, ArrowFunctionExpression, ClassBody
} = exports

## Nodes that contain primitive properties

handlePrimitives = (ctor, primitives) ->
  ctor::childNodes = difference ctor::childNodes, primitives
  ctor::toBasicObject = ->
    obj = Nodes::toBasicObject.call this
    for primitive in primitives
      obj[primitive] = this[primitive]
    obj

handlePrimitives AssignmentExpression, ['operator']
handlePrimitives BinaryExpression, ['operator']
handlePrimitives LogicalExpression, ['operator']
handlePrimitives GenSym, ['ns', 'uniqueId']
handlePrimitives Identifier, ['name']
handlePrimitives Literal, ['value']
handlePrimitives MemberExpression, ['computed']
handlePrimitives UnaryExpression, ['operator']
handlePrimitives UpdateExpression, ['operator', 'prefix']
handlePrimitives VariableDeclaration, ['kind']

## Nodes that contain list properties

handleLists = (ctor, listProps) -> ctor::listMembers = listProps

handleLists ArrayExpression, ['elements']
handleLists ArrayPattern, ['elements']
handleLists ArrowFunctionExpression, ['params', 'defaults']
handleLists BlockStatement, ['body']
handleLists CallExpression, ['arguments']
handleLists ClassBody, ['body']
handleLists FunctionDeclaration, ['params', 'defaults']
handleLists FunctionExpression, ['params', 'defaults']
handleLists NewExpression, ['arguments']
handleLists ObjectExpression, ['properties']
handleLists Program, ['body']
handleLists SequenceExpression, ['expressions']
handleLists SwitchCase, ['consequent']
handleLists SwitchStatement, ['cases']
handleLists TryStatement, ['handlers']
handleLists VariableDeclaration, ['declarations']

# Functions need to be marked as generated when used as IIFE for converting
# statements to expressions so they may be ignored when doing auto-declaration

FunctionDeclaration::generated = FunctionExpression::generated = false
FunctionDeclaration::g = FunctionExpression::g = ->
  @generated = yes
  this
