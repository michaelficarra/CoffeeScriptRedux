suite 'Truthiness', ->

  setup ->
    @truthy = (ast) ->
      ok Optimiser.isTruthy ast
      ok not Optimiser.isFalsey ast
    @falsey = (ast) ->
      ok Optimiser.isFalsey ast
      ok not Optimiser.isTruthy ast
    @neither = (ast) ->
      ok not Optimiser.isTruthy ast
      ok not Optimiser.isFalsey ast

  test 'ints', ->
    @falsey new CS.Int 0
    @truthy new CS.Int 1
    @truthy new CS.Int 9e9

  test 'floats', ->
    @falsey new CS.Float 0.0
    @truthy new CS.Float 0.1
    @truthy new CS.Float 1.1
    @truthy new CS.Float 1.2e+3

  test 'strings', ->
    @falsey new CS.String ''
    @truthy new CS.String '0'

  test 'assignment', ->
    @truthy new CS.AssignOp (new CS.Identifier 'a'), new CS.Int 1
    @falsey new CS.AssignOp (new CS.Identifier 'a'), new CS.Int 0
