suite 'Member Access', ->

  # TODO: all of the things

  test 'various basic member accesses', ->
    nonceA = {}
    nonceB = {a: nonceA}
    nonceA.b = nonceB
    nil = null
    obj = {a: nonceA, prototype: {b: nonceB}}
    a = 'a'
    b = 'b'
    # member access
    eq nonceA, obj.a
    eq nonceA, obj?.a
    eq nonceB, obj?.a.b
    eq nonceB, obj?.a[b]
    throws -> nil.a
    eq undefined, nil?.a
    eq undefined, nil?.a.b
    eq undefined, nil?.a[b]
    # dynamic member access
    eq nonceA, obj[a]
    eq nonceA, obj?[a]
    eq nonceB, obj?[a].b
    eq nonceB, obj?[a][b]
    throws -> nil[a]
    eq undefined, nil?[a]
    eq undefined, nil?[a].b
    eq undefined, nil?[a][b]
    # proto-member access
    eq nonceB, obj::b
    eq nonceB, obj?::b
    eq nonceA, obj?::b.a
    eq nonceA, obj?::b[a]
    throws -> nil::b
    eq undefined, nil?::b
    eq undefined, nil?::b.a
    eq undefined, nil?::b[a]
    # dynamic proto-member access
    eq nonceB, obj::[b]
    eq nonceB, (obj::)[b]
    eq nonceB, obj?::[b]
    eq nonceA, obj?::[b].a
    eq nonceA, obj?::[b][a]
    throws -> nil::[b]
    eq undefined, nil?::[b]
    eq undefined, nil?::[b].a
    eq undefined, nil?::[b][a]

  # TODO: combinations of soaked member accesses

  test 'dynamically accessing non-identifierNames', ->
    nonceA = {}
    nonceB = {}
    obj = {'a-b': nonceA}
    eq nonceA, obj['a-b']
    obj['c-d'] = nonceB
    eq nonceB, obj['c-d']
