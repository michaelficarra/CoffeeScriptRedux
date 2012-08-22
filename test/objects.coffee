suite 'Object Literals', ->

# TODO: refactor object literal tests
# TODO: add indexing and method invocation tests: {a}['a'] is a, {a}.a()

  suite 'Basic Objects', ->

    test 'basic literals', ->
      nonce = {}
      eq nonce, {a:nonce}.a
      eq nonce, {a: nonce}.a
      eq nonce, { a : nonce }.a
      eq nonce, {a: nonce,}.a
      eq nonce, {0: nonce}[0]
      eq nonce, {1e3: nonce}[1e3]
      eq nonce, {a:0,b:nonce,c:0}.b
      eq nonce, {a: 0, b: nonce, c: 0}.b
      eq nonce, {a: 0, b: nonce, c: 0, }.b
      eq nonce, { a : 0 , b : nonce, c : 0 }.b

    test 'reserved words as keys', ->
      obj = {is: yes, not: no}
      ok obj.is
      ok not obj.not

    test 'listed functions', ->
      nonce = {}
      ok nonce, { 0: -> nonce }[0]()
      ok nonce, { 0: -> 0, 1: -> nonce, 2: -> 0 }[1]()

    test 'function context', ->
      nonce = {}
      eq nonce, { nonce: nonce, fn: -> @nonce }.fn()
      eq nonce, { nonce: nonce, fn: -> @nonce }['fn']()

    test 'implicit member shorthand', ->
      nonce = {}
      eq nonce, { nonce }.nonce
      (-> eq nonce, { @nonce }.nonce).call { nonce }

    test 'function calls in object literals', ->
      fn = (a, b, c) -> c
      nonce = {}
      eq nonce, { a: fn 0, 1, nonce, 2 }.a
      eq nonce, { a: -> fn 0, 1, nonce, 2 }.a()

    test 'jashkenas/coffee-script#542: leading objects need parentheses', ->
      a = false
      {f: -> a = true}.f() + 1
      ok a

    #test 'jashkenas/coffee-script#1274: `{} = a()` should not optimise away a()', ->
    #  a = false
    #  fn = -> a = true
    #  {} = fn()
    #  ok a

    test 'jashkenas/coffee-script#1436: `for` etc. work as normal property names', ->
      obj = {}
      ok 'for' not of obj
      obj.for = 'for' of obj
      ok 'for' of obj

    #test 'jashkenas/coffee-script#1513: Top level bare objects need to be wrapped in parens for unary and existence ops', ->
    #  doesNotThrow -> CoffeeScript.run '{}?', bare: true
    #  doesNotThrow -> CoffeeScript.run '{}.a++', bare: true

  suite 'Implicit Objects', ->

    #test 'implicit object literals', ->
    #
    #  obj =
    #    a: 1,
    #    b: 2,
    #  ok obj.a is 1
    #  ok obj.b is 2
    #
    #  config =
    #    development:
    #      server: 'localhost'
    #      timeout: 10
    #    production:
    #      server: 'dreamboat'
    #      timeout: 1000
    #  ok config.development.server  is 'localhost'
    #  ok config.production.server   is 'dreamboat'
    #  ok config.development.timeout is 10
    #  ok config.production.timeout  is 1000

    #test 'implicit objects as part of chained calls', ->
    #  pluck = (x) -> x.a
    #  eq 100, pluck pluck pluck a: a: a: 100

    #test 'explicit objects nested under implicit objects', ->

    #test 'invoking functions with implicit object literals', ->
    #  generateGetter = (prop) -> (obj) -> obj[prop]
    #  getA = generateGetter 'a'
    #  getArgs = -> arguments
    #  a = b = 30
    #
    #  result = getA
    #    a: 10
    #  eq 10, result
    #
    #  result = getA
    #    'a': 20
    #  eq 20, result
    #
    #  result = getA a,
    #    b:1
    #  eq undefined, result
    #
    #  result = getA b:1,
    #  a:43
    #  eq 43, result
    #
    #  result = getA b:1,
    #    a:62
    #  eq undefined, result
    #
    #  result = getA
    #    b:1
    #    a
    #  eq undefined, result
    #
    #  result = getA
    #    a:
    #      b:2
    #    b:1
    #  eq 2, result.b
    #
    #  result = getArgs
    #    a:1
    #    b
    #    c:1
    #  ok result.length is 3
    #  ok result[2].c is 1
    #
    #  result = getA b: 13, a: 42, 2
    #  eq 42, result
    #
    #  result = getArgs a:1, (1 + 1)
    #  ok result[1] is 2
    #
    #  result = getArgs a:1, b
    #  ok result.length is 2
    #  ok result[1] is 30
    #
    #  result = getArgs a:1, b, b:1, a
    #  ok result.length is 4
    #  ok result[2].b is 1
    #
    #  throws -> CoffeeScript.compile 'a = b:1, c'

    #test 'multiple dedentations in implicit object literals', ->
    #  nonce0 = {}
    #  nonce1 = {}
    #  obj =
    #    a:
    #      b: ->
    #        c: nonce0
    #    d: nonce1
    #  eq nonce0, obj.a.b().c
    #  eq nonce1, obj.d

    #test 'jashkenas/coffee-script#1871: Special case for IMPLICIT_END in the middle of an implicit object', ->
    #  result = 'result'
    #  ident = (x) -> x
    #
    #  result = ident one: 1 if false
    #
    #  eq result, 'result'
    #
    #  result = ident
    #    one: 1
    #    two: 2 for i in [1..3]
    #
    #  eq result.two.join(' '), '2 2 2'

    #test 'jashkenas/coffee-script#1961, jashkenas/coffee-script#1974, regression with compound assigning to an implicit object', ->
    #
    #  obj = null
    #
    #  obj ?=
    #    one: 1
    #    two: 2
    #
    #  eq obj.two, 2
    #
    #  obj = null
    #
    #  obj or=
    #    three: 3
    #    four: 4
    #
    #  eq obj.four, 4

    #test 'jashkenas/coffee-script#2207: Immediate implicit closes don't close implicit objects', ->
    #  func = ->
    #    key: for i in [1, 2, 3] then i
    #
    #  eq func().key.join(' '), '1 2 3'
