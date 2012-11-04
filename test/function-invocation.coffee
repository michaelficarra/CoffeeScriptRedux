suite 'Function Invocation', ->

# * Function Invocation
# * Splats in Function Invocations
# * Implicit Returns
# * Explicit Returns
  id = (_) -> if arguments.length is 1 then _ else [].slice.call arguments

  test "basic argument passing", ->
    a = {}
    b = {}
    c = {}
    eq 1, (id 1)
    eq 2, (id 1, 2)[1]
    eq a, (id a)
    eq c, (id a, b, c)[2]

  #test "passing arguments on separate lines", ->
  #  a = {}
  #  b = {}
  #  c = {}
  #  ok(id(
  #    a
  #    b
  #    c
  #  )[1] is b)
  #  eq(0, id(
  #    0
  #    10
  #  )[0])
  #  eq(a,id(
  #    a
  #  ))
  #  eq b,
  #  (id b)

  test "optional parens can be used in a nested fashion", ->
    call = (func) -> func()
    add = (a,b) -> a + b
    result = call ->
      inner = call ->
        add 5, 5
    ok result is 10

  test "hanging commas and semicolons in argument list", ->
    fn = -> arguments.length
    eq 2, fn(0,1,)
    eq 3, fn 0, 1,
    2
    eq 2, fn(0, 1; 2)

  test "function invocation", ->
    func = ->
      return if true
    eq undefined, func()
    result = ("hello".slice) 3
    ok result is 'lo'

  test "And even with strange things like this:", ->
    funcs  = [((x) -> x), ((x) -> x * x)]
    result = funcs[1] 5
    eq 25, result

  test "More fun with optional parens.", ->
    fn = (arg) -> arg
    eq 101, fn(fn {prop: 101}).prop
    okFunc = (f) -> ok(f())
    okFunc -> true

  test "chained function calls", ->
    nonce = {}
    identityWrap = (x) ->
      -> x
    eq nonce, identityWrap(identityWrap(nonce))()()
    eq nonce, (identityWrap identityWrap nonce)()()

  #test "Multi-blocks with optional parens.", ->
  #  fn = (arg) -> arg
  #  result = fn( ->
  #    fn ->
  #      "Wrapped"
  #  )
  #  ok result()() is 'Wrapped'

  test "method calls", ->
    fnId = (fn) -> -> fn.apply this, arguments
    obj = {}
    obj.add = (a, b) -> a + b
    obj.anonymousAdd = (a, b) -> a + b
    obj.fastAdd = fnId (a, b) -> a + b
    eq 10, obj.add(5, 5)
    eq 20, obj.anonymousAdd 10, 10
    eq 40, obj.fastAdd (20), 20

  #test "Ensure that functions can have a trailing comma in their argument list", ->
  #  mult = (x, mids..., y) ->
  #    x *= n for n in mids
  #    x *= y
  #  ok mult(1, 2,) is 2
  #  ok mult(1, 2, 3,) is 6
  #  ok mult(10, (i for i in [1..6])...) is 7200

  test "`@` and `this` should both be able to invoke a function", ->
    nonce = {}
    fn          = (arg) -> eq nonce, arg
    fn.withAt   = -> @ nonce
    fn.withThis = -> this nonce
    fn.withAt()
    fn.withThis()

  test "Trying an implicit object call with a trailing function.", ->
    a = null
    meth = (arg, obj, func) -> a = [obj.a, arg, func()].join ' '
    meth 'apple', b: 1, a: 13, ->
      'orange'
    ok a is '13 apple orange'

  #test "Ensure that empty functions don't return mistaken values.", ->
  #  obj = {func: (@param, @rest...) ->}
  #  ok obj.func(101, 102, 103, 104) is undefined
  #  ok obj.param is 101
  #  ok obj.rest.join(' ') is '102 103 104'

  #test "Passing multiple functions without paren-wrapping is legal, and should compile.", ->
  #  sum = (one, two) -> one() + two()
  #  eq 20, sum ->
  #    7 + 9
  #  , ->
  #    1 + 3
  #  eq 16, sum -> 5 + 7, -> 2 + 3
  #  eq 6, sum( ->
  #    1 + 2
  #  , ->
  #    2 + 1
  #  )

  test "Implicit call with a trailing if statement as a param.", ->
    func = -> arguments[1]
    result = func 'one', if false then 100 else 13
    ok result is 13

  #test "Test more function passing:", ->
  #  sum = (one, two) -> one() + two()
  #
  #  result = sum( ->
  #    1 + 2
  #  , ->
  #    2 + 1
  #  )
  #  ok result is 6
  #
  #  sum = (a, b) -> a + b
  #  result = sum(1
  #  , 2)
  #  ok result is 3

  #test "Chained blocks, with proper indentation levels:", ->
  #  counter =
  #    results: []
  #    tick: (func) ->
  #      @results.push func()
  #      this
  #  counter
  #    .tick ->
  #      3
  #    .tick ->
  #      2
  #    .tick ->
  #      1
  #  arrayEq [3,2,1], counter.results

  test "TODO: find out what this test case is testing and rename it", ->
    x = (obj, func) -> func obj
    ident = (x) -> x
    result = x {one: ident 1}, (obj) ->
      inner = ident(obj)
      ident inner
    ok result.one is 1

  test "More paren compilation tests:", ->
    reverse = (obj) -> obj.reverse()
    ok reverse([1, 2].concat 3).join(' ') is '3 2 1'

  test "Test for inline functions with parentheses and implicit calls.", ->
    combine = (func, num) -> func() * num
    result  = combine (-> 1 + 2), 3
    ok result is 9

  #test "Test for calls/parens/multiline-chains.", ->
  #  f = (x) -> x
  #  result = (f 1).toString()
  #    .length
  #  ok result is 1

  test "Test implicit calls in functions in parens:", ->
    result = ((val) ->
      [].push val
      val
    )(10)
    ok result is 10

  #test "Ensure that chained calls with indented implicit object literals below are alright.", ->
  #  result = null
  #  obj =
  #    method: (val)  -> this
  #    second: (hash) -> result = hash.three
  #  obj
  #    .method(
  #      101
  #    ).second(
  #      one:
  #        two: 2
  #      three: 3
  #    )
  #  eq result, 3

  #test "Test newline-supressed call chains with nested functions.", ->
  #  obj  =
  #    call: -> this
  #  func = ->
  #    obj
  #      .call ->
  #        one two
  #      .call ->
  #        three four
  #    101
  #  eq func(), 101

  #test "Implicit objects with number arguments.", ->
  #  func = (x, y) -> y
  #  obj =
  #    prop: func "a", 1
  #  ok obj.prop is 1

  test "Non-spaced unary and binary operators should cause a function call.", ->
    func = (val) -> val + 1
    ok (func +5) is 6
    ok (func -5) is -4

  test "Prefix unary assignment operators are allowed in parenless calls.", ->
    func = (val) -> val + 1
    val = 5
    ok (func --val) is 5

  test "jashkenas/coffee-script#855: execution context for `func arr...` should be `null`", ->
    contextTest = -> eq @, if window? then window else global
    array = []
    contextTest array
    contextTest.apply null, array
    contextTest array...

  #test "jashkenas/coffee-script#904: Destructuring function arguments with same-named variables in scope", ->
  #  a = b = nonce = {}
  #  fn = ([a,b]) -> {a:a,b:b}
  #  result = fn([c={},d={}])
  #  eq c, result.a
  #  eq d, result.b
  #  eq nonce, a
  #  eq nonce, b

  #test "Simple Destructuring function arguments with same-named variables in scope", ->
  #  x = 1
  #  f = ([x]) -> x
  #  eq f([2]), 2
  #  eq x, 1

  test "caching base value", ->
    obj = {index: 0, 0: {method: -> this is obj[0]}}
    ok obj[obj.index++].method([]...)

  test "passing splats to functions", ->
    arrayEq [0..4], id id [0..4]...
    fn = (a, b, c..., d) -> [a, b, c, d]
    range = [0..3]
    [first, second, others, last] = fn range..., 4, [5...8]...
    eq 0, first
    eq 1, second
    arrayEq [2..6], others
    eq 7, last

  test "splat variables are local to the function", ->
    outer = "x"
    clobber = (avar, outer...) -> outer
    clobber "foo", "bar"
    eq "x", outer

  test "Issue 894: Splatting against constructor-chained functions.", ->
    x = null
    class Foo
      bar: (y) -> x = y
    new Foo().bar([101]...)
    eq x, 101

  test "Functions with splats being called with too few arguments.", ->
    method = (first, variable..., penultimate, ultimate) ->
      penultimate
    eq 8, method 1, 2, 3, 4, 5, 6, 7, 8, 9
    eq 2, method 1, 2, 3
    eq 2, method 1, 2

  #test "splats with super() within classes.", ->
  #  class Parent
  #    meth: (args...) ->
  #      args
  #  class Child extends Parent
  #    meth: ->
  #      nums = [3, 2, 1]
  #      super nums...
  #  ok (new Child).meth().join(' ') is '3 2 1'

  test "jashkenas/coffee-script#1011: passing a splat to a method of a number", ->
    eq '1011', 11.toString [2]...
    eq '1011', (31).toString [3]...
    eq '1011', 69.0.toString [4]...
    eq '1011', (131.0).toString [5]...

  test "splats and the `new` operator: functions that return `null` should construct their instance", ->
    args = []
    child = new (constructor = -> null) args...
    ok child instanceof constructor

  test "splats and the `new` operator: functions that return functions should construct their return value", ->
    args = []
    fn = ->
    child = new (constructor = -> fn) args...
    ok child not instanceof constructor
    eq fn, child

  test "implicit return", ->
    eq ok, new ->
      ok
      ### Should `return` implicitly   ###
      ### even with trailing comments. ###
    eq ok, new ->
      ok
      # Should `return` implicitly
      # even with trailing comments.

  test "implicit returns with multiple branches", ->
    nonce = {}
    fn = ->
      if false
        for a in b
          return c if d
      else
        nonce
    eq nonce, fn()

  test "implicit returns with switches", ->
    nonce = {}
    fn = ->
      switch nonce
        when nonce then nonce
        else return undefined
    eq nonce, fn()

  test "preserve context when generating closure wrappers for expression conversions", ->
    nonce = {}
    obj = {property: nonce, method: ->
      this.result = if false
        10
      else
        "a"
        "b"
        this.property
    }
    eq nonce, obj.method()
    eq nonce, obj.property

  #test "don't wrap 'pure' statements in a closure", ->
  #  nonce = {}
  #  items = [0, 1, 2, 3, nonce, 4, 5]
  #  fn = (items) ->
  #    for item in items
  #      return item if item is nonce
  #  eq nonce, fn items

  test "usage of `new` is careful about where the invocation parens end up", ->
    #eq 'object', typeof new try Array
    eq 'object', typeof new do -> ->

  test "implicit call against control structures", ->
    result = null
    save   = (obj) -> result = obj

    save switch id false
      when true
        'true'
      when false
        'false'
    eq result, 'false'

    save if id false
      'false'
    else
      'true'
    eq result, 'true'

    save unless id false
      'true'
    else
      'false'
    eq result, 'true'

    save try
      doesnt exist
    catch error
      'caught'
    eq result, 'caught'

    save try doesnt(exist) catch error then 'caught2'
    eq result, 'caught2'

  test "jashkenas/coffee-script#1420: things like `(fn() ->)`; there are no words for this one", ->
    fn = -> (f) -> f()
    nonce = {}
    eq nonce, (fn() -> nonce)

  test "jashkenas/coffee-script#1416: don't omit one 'new' when compiling 'new new'", ->
    nonce = {}
    obj = new new -> -> {prop: nonce}
    eq obj.prop, nonce

  test "jashkenas/coffee-script#1416: don't omit one 'new' when compiling 'new new fn()()'", ->
    nonce = {}
    argNonceA = {}
    argNonceB = {}
    fn = (a) -> (b) -> {a, b, prop: nonce}
    obj = new new fn(argNonceA)(argNonceB)
    eq obj.prop, nonce
    eq obj.a, argNonceA
    eq obj.b, argNonceB

  test "jashkenas/coffee-script#1840: accessing the `prototype` after function invocation should compile", ->
    nonce = {}
    obj = {prototype: {id: nonce}}
    dotAccess = -> obj.prototype
    protoAccess = -> obj
    eq dotAccess().id, nonce
    eq protoAccess()::id, nonce

  test "jashkenas/coffee-script#960: improved 'do'", ->

    do (nonExistent = 'one') ->
      eq nonExistent, 'one'

    overridden = 1
    do (overridden = 2) ->
      eq overridden, 2

    two = 2
    do (one = 1, two, three = 3) ->
      eq one, 1
      eq two, 2
      eq three, 3

    ret = do func = (two) ->
      eq two, 2
      func
    eq ret, func

  test "soaked function application", ->
    nonce = {}
    eq undefined, f?(0, 1)
    eq undefined, f? 0, 1
    eq undefined, f?
      a: 0
    eq undefined, f? 0,
      a: 1
    f = -> nonce
    eq nonce, f?(0, 1)
    eq nonce, f? 0, 1
    eq nonce, f?
      a: 0
    eq nonce, f? 0,
      a: 1
