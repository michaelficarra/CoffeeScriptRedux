suite 'Scope', ->

  test 'basics', ->
    a = true
    ok a
    fn = -> b = 0
    throws -> b
    eq 'undefined', typeof b

  test 'assignments within assignments', ->
    throws -> a
    throws -> b
    fn = ->
      a = b = 0
      eq 'number', typeof a
      eq 'number', typeof b
    throws -> a
    throws -> b

  test 'reassignments in a closure', ->
    a = false
    ok not a
    do -> a = true
    ok a

    b = false
    fn = -> b = true
    ok not b
    ok fn()
    ok b

  test 'vars are function-scoped, not block-scoped', ->
    fn = -> true
    if fn()
      a = 1
    else
      a = 0
    ok a

  test 'function params are added to scope', ->
    fn = (p) -> ok p
    fn true

  test 're-assignments of function params', ->
    nonce = {}
    fn = (p) ->
      eq nonce, p
      p = 0
      ok not p
    fn nonce

  test 're-assignments of function params in a loop', ->
    nonce = {}
    fn = (p) ->
      eq nonce, p
      a = 1
      while a--
        p = 0
      ok not p
    fn nonce

  test 're-assignments of function params in a loop used as a value', ->
    nonce = {}
    fn = (p) ->
      eq nonce, p
      a = 1
      b = while a--
        p = 0
      ok not p
    fn nonce

  test '#46: declarations in a loop used as a value', ->
    a = 0
    a = while a--
      b = 1
    eq undefined, b

  test '#46: declarations in a switch used as a value', ->
    b = 0
    c = 1
    x = switch c
      when 0 then a = b
      else a = c
    eq 1, a

  test 'loop iterators available within the loop', ->
    for v, k in [1]
      ok v
      ok not k
    return

  test 'loop iterators available outside the loop (ew)', ->
    fn = ->
    for v, k in [1]
      fn()
    ok v
    ok not k

  test '`do` acts as `let`', ->
    outerNonce = nonce = {}
    do (nonce) ->
      eq outerNonce, nonce
      nonce = {}
    eq outerNonce, nonce
