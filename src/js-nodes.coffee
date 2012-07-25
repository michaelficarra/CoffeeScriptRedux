createNode = (type, props) ->
  class extends Node
    constructor: ->
      @[prop] = arguments[i] for prop, i in props
    type: @className = type
    properties: props

@Node = class Node
  toJSON: ->
    obj = {@type}
    for prop in @properties
      obj[prop] = if @[prop] instanceof Node then @[prop].toJSON() else @[prop]
    obj

nodeData = [
  ['AssignmentExpression' , ['left', 'right']]
  ['ArrayExpression'      , ['elements']]
  ['BlockStatement'       , ['body']]
  ['BinaryExpression'     , ['left', 'right']]
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
  ['UnaryExpression'      , ['argument']]
  ['UpdateExpression'     , ['argument']]
  ['VariableDeclaration'  , ['declarations']]
  ['VariableDeclarator'   , ['id', 'init']]
  ['WhileStatement'       , ['test', 'body']]
  ['WithStatement'        , ['object', 'body']]
]

for [node, params] in nodeData
  @[node] = createNode node, params
