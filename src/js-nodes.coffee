{difference} = require './functional-helpers'
exports = module?.exports ? this

createNode = (type, props) ->
  class extends Nodes
    constructor: ->
      @[prop] = arguments[i] for prop, i in props
    type: type
    childNodes: props

@Nodes = class Nodes
  listMembers: []
  instanceof: (ctors...) ->
    # not a fold for efficiency's sake
    for ctor in ctors when @type is ctor::type
      return yes
    no
  toJSON: ->
    json = {@type}
    json.leadingComments = @leadingComments if @leadingComments?
    for child in @childNodes
      if child in @listMembers
        json[child] = (p.toJSON() for p in @[child])
      else
        json[child] = @[child]?.toJSON()
    json

nodeData = [
  ['ArrayExpression'      , no , ['elements']]
  ['AssignmentExpression' , no , ['operator', 'left', 'right']]
  ['BinaryExpression'     , no , ['operator', 'left', 'right']]
  ['BlockStatement'       , yes, ['body']]
  ['BreakStatement'       , yes, ['label']]
  ['CallExpression'       , no , ['callee', 'arguments']]
  ['CatchClause'          , yes, ['param', 'body']]
  ['ConditionalExpression', no , ['test', 'consequent', 'alternate']]
  ['ContinueStatement'    , yes, ['label']]
  ['DebuggerStatement'    , yes, []]
  ['DoWhileStatement'     , yes, ['body', 'test']]
  ['EmptyStatement'       , yes, []]
  ['ExpressionStatement'  , yes, ['expression']]
  ['ForInStatement'       , yes, ['left', 'right', 'body']]
  ['ForStatement'         , yes, ['init', 'test', 'update', 'body']]
  ['FunctionDeclaration'  , yes, ['id', 'params', 'body']]
  ['FunctionExpression'   , no , ['id', 'params', 'body']]
  ['GenSym'               , no , ['ns', 'uniqueId']]
  ['Identifier'           , no , ['name']]
  ['IfStatement'          , yes, ['test', 'consequent', 'alternate']]
  ['LabeledStatement'     , yes, ['label', 'body']]
  ['Literal'              , no , ['value']]
  ['LogicalExpression'    , no , ['left', 'right']]
  ['MemberExpression'     , no , ['computed', 'object', 'property']]
  ['NewExpression'        , no , ['callee', 'arguments']]
  ['ObjectExpression'     , no , ['properties']]
  ['Program'              , yes, ['body']]
  ['Property'             , yes, ['key', 'value']]
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
  CallExpression, SequenceExpression, ArrayExpression, BinaryExpression,
  UnaryExpression, NewExpression, VariableDeclaration, ObjectExpression,
  MemberExpression, UpdateExpression, AssignmentExpression, GenSym,
  FunctionDeclaration, VariableDeclaration, SwitchStatement, SwitchCase
} = exports

## Nodes that contain primitive properties

handlePrimitives = (ctor, primitives) ->
  ctor::childNodes = difference ctor::childNodes, primitives
  ctor::toJSON = ->
    json = Nodes::toJSON.call this
    for primitive in primitives
      json[primitive] = @[primitive]
    json

handlePrimitives AssignmentExpression, ['operator']
handlePrimitives BinaryExpression, ['operator']
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
handleLists BlockStatement, ['body']
handleLists CallExpression, ['arguments']
handleLists FunctionDeclaration, ['params']
handleLists FunctionExpression, ['params']
handleLists NewExpression, ['arguments']
handleLists ObjectExpression, ['properties']
handleLists Program, ['body']
handleLists SequenceExpression, ['expressions']
handleLists SwitchCase, ['consequent']
handleLists SwitchStatement, ['cases']
handleLists VariableDeclaration, ['declarations']
