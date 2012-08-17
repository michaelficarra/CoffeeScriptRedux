{concat, concatMap, difference, foldl, map, nub} = require './functional-helpers'
CS = require './nodes'


@numberLines = numberLines = (input, startLine = 1) ->
  lines = input.split '\n'
  padSize = ((lines.length + startLine - 1).toString 10).length
  numbered = for line, i in lines
    currLine = "#{i + startLine}"
    pad = ((Array padSize + 1).join '0')[currLine.length..]
    "#{pad}#{currLine} : #{lines[i]}"
  numbered.join '\n'

cleanMarkers = (str) -> str.replace /\uEFEF|\uEFFE\uEFFF/g, ''

@humanReadable = humanReadable = (str) ->
  (str.replace /\uEFEF/g, '(INDENT)').replace /\uEFFE\uEFFF/g, '(DEDENT)'

@formatParserError = (input, e) ->
  if e.found?
    lines = input.split '\n'
    numLinesOfContext = 3
    currentLineOffset = e.line - 1
    startLine = currentLineOffset - numLinesOfContext
    if startLine < 0 then startLine = 0
    preLines = map lines[startLine ... currentLineOffset], cleanMarkers
    line = lines[currentLineOffset]
    postLines = map lines[currentLineOffset + 1 .. currentLineOffset + numLinesOfContext], cleanMarkers
    e.column = (cleanMarkers ("#{line}\n")[..e.column]).length - 1
  unexpected = if e.found? then "'#{e.found.replace /'/g, '\\\''}'" else 'end of input'
  message = humanReadable "Syntax error on line #{e.line}, column #{e.column}: unexpected #{unexpected}"
  if e.found?
    padSize = ((currentLineOffset + 1 + postLines.length).toString 10).length
    message = [
      message
      numberLines ([preLines..., cleanMarkers line].join '\n'), startLine + 1
      "#{(Array padSize + 1).join '^'} :~#{(Array e.column).join '~'}^"
      numberLines (postLines.join '\n'), currentLineOffset + 2
    ].join '\n'
  message


# these are the identifiers that need to be declared when the given value is
# being used as the target of an assignment
@beingDeclared = beingDeclared = (assignment) -> switch
  when not assignment? then []
  when assignment.instanceof CS.Identifiers then [assignment.data]
  when assignment.instanceof CS.MemberAccessOps then []
  when assignment.instanceof CS.AssignOp then beingDeclared assignment.assignee
  when assignment.instanceof CS.ArrayInitialiser then concatMap assignment.members, beingDeclared
  when assignment.instanceof CS.ObjectInitialiser then concatMap assignment.vals(), beingDeclared
  else throw new Error "beingDeclared: Non-exhaustive patterns in case: #{assignment.className}"

@declarationsFor = (node, inScope) ->
  vars = envEnrichments node, inScope
  foldl (new CS.Undefined).g(), vars, (expr, v) ->
    (new CS.AssignOp (new CS.Identifier v).g(), expr).g()

# TODO: name change; this tests when a node is *being used as a value*
usedAsExpression_ = (ancestors) ->
  parent = ancestors[0]
  grandparent = ancestors[1]
  switch
    when !parent? then yes
    when parent.instanceof CS.Program, CS.Class then no
    when parent.instanceof CS.SeqOp
      this is parent.right and
      usedAsExpression parent, ancestors[1..]
    when (parent.instanceof CS.Block) and
    (parent.statements.indexOf this) isnt parent.statements.length - 1
      no
    when (parent.instanceof CS.Functions) and
    parent.body is this and
    grandparent?.instanceof CS.Constructor
      no
    else yes

@usedAsExpression = usedAsExpression = (node, ancestors) ->
  usedAsExpression_.call node, ancestors

# environment enrichments that occur when this node is evaluated
# Note: these are enrichments of the *surrounding* environment; while function
# parameters do enrich *an* environment, that environment is newly created
envEnrichments_ = (inScope = []) ->
  possibilities = switch
    when @instanceof CS.AssignOp then nub beingDeclared @assignee
    when @instanceof CS.Class
      nub concat [
        beingDeclared @nameAssignee
        envEnrichments @parent
        if name? then [name] else []
      ]
    when @instanceof CS.ForIn, CS.ForOf
      nub concat [
        concatMap @childNodes, (child) =>
          if child in @listMembers
          then concatMap @[child], (m) -> envEnrichments m, inScope
          else envEnrichments @[child], inScope
        beingDeclared @keyAssignee
        beingDeclared @valAssignee
      ]
    else
      nub concatMap @childNodes, (child) =>
        if child in @listMembers
        then concatMap @[child], (m) -> envEnrichments m, inScope
        else envEnrichments @[child], inScope
  difference possibilities, inScope

@envEnrichments = envEnrichments = (node, args...) ->
  if node? then envEnrichments_.apply node, args else []
