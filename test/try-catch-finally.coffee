suite 'Try/Catch/Finally', ->

  test 'simple try-catch-finally', ->
    t = c = f = 0
    try
      ++t
      throw {}
    catch e
      ++c
    finally
      ++f
    eq 1, t
    eq 1, c
    eq 1, f

    t = c = f = 0
    try
      ++t
    catch e
      # catch should not be executed if nothing is thrown
      ++c
    finally
      # but finally should always be executed
      ++f
    eq 1, t
    eq 0, c
    eq 1, f

  test 'try without catch just suppresses thrown errors', ->
    try throw {}

  test 'catch variable is not let-scoped as in JS', ->
    nonce = {}
    try throw nonce
    catch e then
    eq nonce, e

  test 'destructuring in catch', ->
    nonce = {}
    try throw {nonce}
    catch {nonce: a}
      eq nonce, a
