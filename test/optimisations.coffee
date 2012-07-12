suite 'Optimisations', ->

  test 'do not optimise away indirect eval', (done) ->
    parse '(0; eval) 1', (ast) =>
      ast = optimise ast
      eq SeqOp::className, ast?.block?.statements?[0]?.function?.className
      do done
