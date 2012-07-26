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
    for child in @childNodes
      if child in @listMembers
        json[child] = (p.toJSON() for p in @[child])
      else
        json[child] = @[child]?.toJSON()
    json

nodeData = [
  ['AssignmentExpression' , ['left', 'right']]
  ['ArrayExpression'      , ['elements']]
  ['BlockStatement'       , ['body']]
  ['BinaryExpression'     , ['operator', 'left', 'right']]
  ['BreakStatement'       , ['label']]
  ['CallExpression'       , ['callee', 'arguments']]
  ['CatchClause'          , ['param', 'body']]
  ['ConditionalExpression', ['test', 'consequent', 'alternate']]
  ['ContinueStatement'    , ['label']]
  ['DoWhileStatement'     , ['body', 'test']]
  ['DebuggerStatement'    , []]
  ['EmptyStatement'       , []]
  ['ExpressionStatement'  , ['expression']]
  ['ForStatement'         , ['init', 'test', 'update', 'body']]
  ['ForInStatement'       , ['left', 'right', 'body']]
  ['FunctionDeclaration'  , ['id', 'params', 'body']]
  ['FunctionExpression'   , ['id', 'params', 'body']]
  ['GenSym'               , ['id']]
  ['Identifier'           , ['name']]
  ['IfStatement'          , ['test', 'consequent', 'alternate']]
  ['Literal'              , ['value']]
  ['LabeledStatement'     , ['label', 'body']]
  ['LogicalExpression'    , ['left', 'right']]
  ['MemberExpression'     , ['object', 'property']]
  ['NewExpression'        , ['callee', 'arguments']]
  ['ObjectExpression'     , ['properties']]
  ['Program'              , ['body']]
  ['Property'             , ['key', 'value']]
  ['ReturnStatement'      , ['argument']]
  ['SequenceExpression'   , ['expressions']]
  ['SwitchStatement'      , ['descriminant', 'cases']]
  ['SwitchCase'           , ['test', 'consequent']]
  ['ThisExpression'       , []]
  ['ThrowStatement'       , ['argument']]
  ['TryStatement'         , ['block', 'handlers', 'finalizer']]
  ['UnaryExpression'      , ['operator', 'argument']]
  ['UpdateExpression'     , ['argument']]
  ['VariableDeclaration'  , ['declarations']]
  ['VariableDeclarator'   , ['id', 'init']]
  ['WhileStatement'       , ['test', 'body']]
  ['WithStatement'        , ['object', 'body']]
]

for [node, params] in nodeData
  exports[node] = createNode node, params


{
  Program, BlockStatement, Literal, Identifier, FunctionExpression,
  CallExpression, SequenceExpression, ArrayExpression, BinaryExpression,
  UnaryExpression, NewExpression
} = exports

## Nodes that contain primitive properties

handlePrimitives = (ctor, primitives) ->
  ctor::childNodes = difference ctor::childNodes, primitives
  ctor::toJSON = ->
    json = Nodes::toJSON.call this
    for primitive in primitives
      json[primitive] = @[primitive]
    json

handlePrimitives Literal, ['value']
handlePrimitives Identifier, ['name']
handlePrimitives BinaryExpression, ['operator']
handlePrimitives UnaryExpression, ['operator']


## Nodes that contain list properties

handleLists = (ctor, listProps) -> ctor::listMembers = listProps

handleLists Program, ['body']
handleLists BlockStatement, ['body']
handleLists FunctionExpression, ['params']
handleLists CallExpression, ['arguments']
handleLists SequenceExpression, ['expressions']
handleLists ArrayExpression, ['elements']
handleLists NewExpression, ['arguments']
