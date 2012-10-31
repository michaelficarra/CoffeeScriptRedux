{concat, concatMap, difference, foldl, map, nub} = require './functional-helpers'
CS = require './nodes'


@numberLines = numberLines = (input, startLine = 1) ->
  lines = input.split '\n'
  padSize = "#{lines.length + startLine - 1}".length
  numbered = for line, i in lines
    currLine = "#{i + startLine}"
    pad = ((Array padSize + 1).join '0')[currLine.length..]
    "#{pad}#{currLine} : #{lines[i]}"
  numbered.join '\n'

cleanMarkers = (str) -> str.replace /[\uEFEF\uEFFE\uEFFF]/g, ''

@humanReadable = humanReadable = (str) ->
  ((str.replace /\uEFEF/g, '(INDENT)').replace /\uEFFE/g, '(DEDENT)').replace /\uEFFF/g, '(TERM)'

@formatParserError = (input, e) ->
  realColumn = (cleanMarkers "#{(input.split '\n')[e.line - 1]}\n"[...e.column]).length
  unless e.found?
    return "Syntax error on line #{e.line}, column #{realColumn}: unexpected end of input"
  found = JSON.stringify humanReadable e.found
  found = ((found.replace /^"|"$/g, '').replace /'/g, '\\\'').replace /\\"/g, '"'
  message = "Syntax error on line #{e.line}, column #{realColumn}: unexpected '#{found}'"
  "#{message}\n#{pointToErrorLocation input, e.line, realColumn}"

@pointToErrorLocation = pointToErrorLocation = (source, line, column, numLinesOfContext = 3) ->
  lines = source.split '\n'
  # figure out which lines are needed for context
  currentLineOffset = line - 1
  startLine = currentLineOffset - numLinesOfContext
  if startLine < 0 then startLine = 0
  # get the context lines
  preLines = lines[startLine..currentLineOffset]
  postLines = lines[currentLineOffset + 1 .. currentLineOffset + numLinesOfContext]
  numberedLines = (numberLines (cleanMarkers [preLines..., postLines...].join '\n'), startLine + 1).split '\n'
  preLines = numberedLines[0...preLines.length]
  postLines = numberedLines[preLines.length...]
  # set the column number to the position of the error in the cleaned string
  column = (cleanMarkers "#{lines[currentLineOffset]}\n"[...column]).length
  padSize = ((currentLineOffset + 1 + postLines.length).toString 10).length
  [
    preLines...
    "#{(Array padSize + 1).join '^'} :~#{(Array column).join '~'}^"
    postLines...
  ].join '\n'

# these are the identifiers that need to be declared when the given value is
# being used as the target of an assignment
@beingDeclared = beingDeclared = (assignment) -> switch
  when not assignment? then []
  when assignment.instanceof CS.Identifiers then [assignment.data]
  when assignment.instanceof CS.Rest then beingDeclared assignment.expression
  when assignment.instanceof CS.MemberAccessOps then []
  when assignment.instanceof CS.DefaultParam then beingDeclared assignment.param
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
    grandparent? and grandparent.instanceof CS.Constructor
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
    when @instanceof CS.Functions then []
    else
      nub concatMap @childNodes, (child) =>
        if child in @listMembers
        then concatMap @[child], (m) -> envEnrichments m, inScope
        else envEnrichments @[child], inScope
  difference possibilities, inScope

@envEnrichments = envEnrichments = (node, args...) ->
  if node? then envEnrichments_.apply node, args else []
