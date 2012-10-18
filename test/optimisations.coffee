suite 'Optimisations', ->

  # by definition, anything that is optimised away will not be detectable at
  # runtime, so we will have to do tests on the AST structure

  suite 'Non-optimisations', ->

    test 'do not optimise away indirect eval', ->
      do -> (1; eval) 'var thisShouldBeInTheGlobalScope = 0'
      eq 'number', typeof thisShouldBeInTheGlobalScope
      delete global.thisShouldBeInTheGlobalScope

    test 'do not optimise away declarations in conditionals', ->
      if 0 then a = 0
      eq undefined, a
      if 1 then 0 else b = 0
      eq undefined, b

    test 'do not optimise away declarations in while loops', ->
      while 0 then a = 0
      eq undefined, a

    test 'do not optimise away declarations in for-in loops', ->
      for a in [] then b = 0
      eq undefined, a
      eq undefined, b

    test 'do not optimise away declarations in for-of loops', ->
      for own a of {} then b = 0
      eq undefined, a
      eq undefined, b

    test 'do not optimise away declarations in logical not ops', ->
      not (a = 0)
      eq 0, a

    test '#71: assume JS literals have side effects, do not eliminate them', ->
      nonce = {}
      a = null
      `a = nonce`
      eq nonce, a
