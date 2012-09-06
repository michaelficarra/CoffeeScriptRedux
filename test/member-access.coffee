suite 'Member Access', ->

  # TODO: all of the things

  test 'various unsoaked member accesses', ->
    nonceA = {}
    nonceB = {}
    nil = null
    obj = {a: nonceA, prototype: {b: nonceB}}
    a = 'a'
    b = 'b'
    # member access
    eq nonceA, obj.a
    throws -> nil.a
    eq undefined, nil?.a
    # dynamic member access
    eq nonceA, obj[a]
    throws -> nil[a]
    eq undefined, nil?[a]
    # proto-member access
    eq nonceB, obj::b
    throws -> nil::b
    eq undefined, nil?::b
    # dynamic proto-member access
    eq nonceB, obj::[b]
    throws -> nil::[b]
    eq undefined, nil?::[b]

  test 'dynamically accessing non-identifierNames', ->
    nonceA = {}
    nonceB = {}
    obj = {'a-b': nonceA}
    eq nonceA, obj['a-b']
    obj['c-d'] = nonceB
    eq nonceB, obj['c-d']
