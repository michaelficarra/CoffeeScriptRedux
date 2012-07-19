{foldl} = require './functional-helpers'

# these are the identifiers that need to be declared when the given value is
# being used as the target of an assignment
@beingDeclared = beingDeclared = (assignment) ->
  switch assignment.className
    when Identifier::className then [assignment]
    when AssignOp::className then beingDeclared assignment.assignee
    when ArrayInitialiser::className then concatMap assignment.members, beingDeclared
    when ObjectInitialiser::className then concatMap assignment.vals(), beingDeclared
    else throw new Error "beingDeclared: Non-exhaustive patterns in case: #{assignment.className}"

@declarationsFor = (node) ->
  vars = node.envEnrichments()
  foldl (new Undefined).g(), vars, (expr, v) ->
    (new AssignOp v, expr).g()

usedAsExpression_ = (node, parent, grandparent, otherAncestors...) -> switch
  when !parent? then yes
  when parent.instanceof Program, Class then no
  when parent.instanceof SeqOp then this is parent.right
  when (parent.instanceof Block) and
  (parent.statements.indexOf this) isnt parent.statements.length - 1
    no
  when (parent.instanceof CSFunction, BoundFunction) and
  parent.body is this and
  (grandparent?.instanceof ClassProtoAssignOp) and
  (grandparent.assignee.instanceof CSString) and
  grandparent.assignee.data is 'constructor'
    no
  else yes

@usedAsExpression = (node, ancestors) ->
  usedAsExpression_.apply node, [node, ancestors...]
