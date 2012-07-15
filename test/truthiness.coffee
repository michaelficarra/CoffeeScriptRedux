suite 'Truthiness', ->

  setup ->
    @truthy = (ast) ->
      ok ast.isTruthy()
      ok not ast.isFalsey()
    @falsey = (ast) ->
      ok ast.isFalsey()
      ok not ast.isTruthy()
    @neither = (ast) ->
      ok not ast.isTruthy()
      ok not ast.isFalsey()

  test 'ints', ->
    @falsey new Int 0
    @truthy new Int 1
    @truthy new Int 9e9

  test 'floats', ->
    @falsey new Float 0.0
    @truthy new Float 0.1
    @truthy new Float 1.1
    @truthy new Float 1.2e+3

  test 'strings', ->
    @falsey new CSString ''
    @truthy new CSString '0'

  test 'assignment', ->
    @truthy new AssignOp (new Identifier 'a'), new Int 1
    @falsey new AssignOp (new Identifier 'a'), new Int 0
