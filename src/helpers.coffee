{concatMap, foldl, nub} = require './functional-helpers'
CS = require './nodes'

# these are the identifiers that need to be declared when the given value is
# being used as the target of an assignment
@beingDeclared = beingDeclared = (assignment) -> switch
  when assignment.instanceof CS.Identifier then [assignment]
  when assignment.instanceof CS.AssignOp then beingDeclared assignment.assignee
  when assignment.instanceof CS.ArrayInitialiser then concatMap assignment.members, beingDeclared
  when assignment.instanceof CS.ObjectInitialiser then concatMap assignment.vals(), beingDeclared
  else throw new Error "beingDeclared: Non-exhaustive patterns in case: #{assignment.className}"

@declarationsFor = (node) ->
  vars = envEnrichments node
  foldl (new CS.Undefined).g(), vars, (expr, v) ->
    (new CS.AssignOp v, expr).g()

usedAsExpression_ = (node, parent, grandparent, otherAncestors...) -> switch
  when !parent? then yes
  when parent.instanceof CS.Program, CS.Class then no
  when parent.instanceof CS.SeqOp then this is parent.right
  when (parent.instanceof CS.Block) and
  (parent.statements.indexOf this) isnt parent.statements.length - 1
    no
  when (parent.instanceof CS.Function, CS.BoundFunction) and
  parent.body is this and
  (grandparent?.instanceof CS.ClassProtoAssignOp) and
  (grandparent.assignee.instanceof CS.String) and
  grandparent.assignee.data is 'constructor'
    no
  else yes

@usedAsExpression = (node, ancestors) ->
  usedAsExpression_.apply node, [node, ancestors...]

# environment enrichments that occur when this node is evaluated
envEnrichments_ = -> switch
  when @instanceof CS.ArrayInitialiser then nub (concatMap @members, (m) -> envEnrichments m)
  when @instanceof CS.AssignOp then nub beingDeclared @assignee
  when @instanceof CS.Block then nub concatMap @statements, (s) -> envEnrichments s
  when @instanceof CS.Class
    declaredInName = if @nameAssignment? then beingDeclared @nameAssignment else []
    nub declaredInName.concat (if name? then [name] else [])
  when @instanceof CS.ForIn
    nub concat [
      concatMap @childNodes, (child) => envEnrichments @[child]
      beingDeclared @valAssignee
      if @keyAssignee? then beingDeclared @keyAssignee else []
    ]
  when @instanceof CS.ForOf
    nub concat [
      concatMap @childNodes, (child) => envEnrichments @[child]
      beingDeclared @keyAssignee
      if @valAssignee? then beingDeclared @valAssignee else []
    ]
  when @instanceof CS.FunctionApplication then nub concatMap @arguments, (arg) -> envEnrichments arg
  when @instanceof CS.ObjectInitialiser then nub concatMap @members, ([key, expr]) -> envEnrichments expr
  when @instanceof CS.Super then nub concatMap @arguments, (a) -> envEnrichments a
  when @instanceof CS.Switch then nub concatMap [@expr, @elseBlock, @cases...], (e) -> envEnrichments e
  when @instanceof CS.SwitchCase then nub concatMap [@block, @conditions...], (e) -> envEnrichments e
  else nub concatMap @childNodes, (child) => envEnrichments @[child]

@envEnrichments = envEnrichments = (node) -> if node? then envEnrichments_.call node else []
