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
    json.comments = @comments if @comments?
    for child in @childNodes
      if child in @listMembers
        json[child] = (p.toJSON() for p in @[child])
      else
        json[child] = @[child]?.toJSON()
    json

nodeData = [
  ['AssignmentExpression' , ['operator', 'left', 'right']]
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
  ['GenSym'               , ['ns', 'uniqueId']]
  ['Identifier'           , ['name']]
  ['IfStatement'          , ['test', 'consequent', 'alternate']]
  ['Literal'              , ['value']]
  ['LabeledStatement'     , ['label', 'body']]
  ['LogicalExpression'    , ['left', 'right']]
  ['MemberExpression'     , ['computed', 'object', 'property']]
  ['NewExpression'        , ['callee', 'arguments']]
  ['ObjectExpression'     , ['properties']]
  ['Program'              , ['body']]
  ['Property'             , ['key', 'value']]
  ['ReturnStatement'      , ['argument']]
  ['SequenceExpression'   , ['expressions']]
  ['SwitchStatement'      , ['discriminant', 'cases']]
  ['SwitchCase'           , ['test', 'consequent']]
  ['ThisExpression'       , []]
  ['ThrowStatement'       , ['argument']]
  ['TryStatement'         , ['block', 'handlers', 'finalizer']]
  ['UnaryExpression'      , ['operator', 'argument']]
  ['UpdateExpression'     , ['operator', 'prefix', 'argument']]
  ['VariableDeclaration'  , ['kind', 'declarations']]
  ['VariableDeclarator'   , ['id', 'init']]
  ['WhileStatement'       , ['test', 'body']]
  ['WithStatement'        , ['object', 'body']]
]

for [node, params] in nodeData
  exports[node] = createNode node, params


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
console.log SwitchCase::listMembers, SwitchCase::childNodes
handleLists SwitchStatement, ['cases']
handleLists VariableDeclaration, ['declarations']
