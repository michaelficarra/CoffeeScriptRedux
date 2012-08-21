suite 'Arrays', ->

  suite 'Basic Literals', ->

    test 'simple arrays', ->
      eq 0, [].length
      eq 0, [ ].length
      eq 1, [0].length
      eq 1, [ 0 ].length
      eq 2, [0,0].length
      eq 2, [0, 0].length
      eq 2, [0 ,0].length
      eq 2, [ 0 , 0 ].length
      eq 3, [0,0,0].length
      eq 3, [0, 0, 0].length
      eq 3, [ 0 , 0 , 0 ].length
      eq k, v for v, k in [0, 1, 2, 3]
      eq k, v for v, k in [0, 1, 2, 3,]
      return

    test 'arrays spread over many lines', ->
      eq 0, [
      ].length
      eq 1, [
        0
      ].length
      eq 1, [
        0,
      ].length
      eq 2, [
        0
        0
      ].length
      eq 2, [
        0,
        0
      ].length
      eq 2, [
        0,
        0,
      ].length
      eq k, v for v, k in [
        0
        1
        2
        3
      ]
      return

    test 'nested arrays', ->
      eq 1, [[]].length
      eq 0, [[]][0].length
      eq 1, [[0]].length
      eq 1, [[0]][0].length
      eq 2, [[0],[1]].length
      eq 0, [[0],[1]][0][0]
      eq 1, [[0],[1]][1][0]
      eq 3, [
        []
        [[], []]
        [ [[], []], [] ]
      ].length

    test 'mixed newline/comma separators', ->
      eq k, v for v, k in [
        0
        1, 2, 3,
        4, 5, 6
        7, 8, 9,
      ]
      return

    test 'listed functions', ->
      a = [
        (x) -> x * x
        ->
        (x) ->  x
      ]
      ok a.length is 3
      b = [(x) -> x * x, ->, (x) ->  x, ->]
      ok b.length is 4

    #test 'dedented comma style', ->
    #  eq 3, [
    #    0
    #  ,
    #    0
    #  ,
    #    0
    #  ].length

    #test 'jashkenas/coffee-script#1274: `[] = a()` compiles to `false` instead of `a()`', ->
    #  a = false
    #  fn = -> a = true
    #  [] = fn()
    #  ok a

    #test 'mixed shorthand objects in array lists', ->
    #
    #  arr = [
    #    a:1
    #    'b'
    #    c:1
    #  ]
    #  ok arr.length is 3
    #  ok arr[2].c is 1
    #
    #  arr = [b: 1, a: 2, 100]
    #  eq arr[1], 100
    #
    #  arr = [a:0, b:1, (1 + 1)]
    #  eq arr[1], 2
    #
    #  arr = [a:1, 'a', b:1, 'b']
    #  eq arr.length, 4
    #  eq arr[2].b, 1
    #  eq arr[3], 'b'


  suite 'Splats', ->

    test 'basic splats', ->
      a = [1, 2, 3]
      arrayEq [1, 2, 3], [a...]
      arrayEq [0, 1, 2, 3], [0, a...]
      arrayEq [1, 2, 3, 4], [a..., 4]
      arrayEq [1, 2, 3, 1, 2, 3], [a..., a...]
      arrayEq [1, 2, 3, [1, 2, 3]], [a..., [a]...]
      arrayEq [[0], 1, 2, 3], [[0], a...]
      arrayEq [0, 1, 2, 3], [[0]..., a...]
      b = [1, [2], 3]
      arrayEq [1, [2], 3], [b...]
      arrayEq [[0], 1, [2], 3], [[0], b...]

    test 'splats and member access', ->
      arr = [0, 1, 2]
      a = 'a'
      obj = {a: arr, prototype: {a: arr}}
      arrayEq arr, [obj.a...]
      arrayEq arr, [obj::a...]
      arrayEq arr, [obj[a]...]
      arrayEq arr, [obj::[a]...]
      arrayEq arr, [obj?.a...]
      arrayEq arr, [obj?::a...]
      arrayEq arr, [obj?[a]...]
      arrayEq arr, [obj?::[a]...]

    test 'splats and function invocation', ->
      arr = [1, 2, 3]
      fn = -> arr
      obj = {fn: fn}
      arrayEq arr, [(do fn)...]
      arrayEq arr, [fn()...]
      arrayEq arr, [(fn 0)...]
      arrayEq arr, [fn(0)...]
      arrayEq arr, [(do obj.fn)...]
      arrayEq arr, [obj.fn()...]
      arrayEq arr, [(obj.fn 0)...]
      arrayEq arr, [obj.fn(0)...]

    test 'splats and array-like objects', ->
      obj = {0: 1, 1: 2, 2: 3, length: 3}
      fn = ->
        arrayEq ([].slice.call arguments), [arguments...]
        arguments
      arrayEq [1, 2, 3], [obj...]
      arrayEq [0, 1, 2, 3, 4], [0, obj..., 4]
      arrayEq [1, 2, 3], [(fn 1, 2, 3)...]
      arrayEq [0, 1, 2, 3, 4], [0, (fn 1, 2, 3)..., 4]

    test 'array splat expansions with assignments', ->
      nums = [1, 2, 3]
      list = [a = 0, nums..., b = 4]
      eq 0, a
      eq 4, b
      arrayEq [0,1,2,3,4], list

    test 'array splats with nested arrays', ->
      nonce = {}
      a = [nonce]
      list = [1, 2, a...]
      eq list[0], 1
      eq list[2], nonce

      a = [[nonce]]
      list = [1, 2, a...]
      arrayEq list, [1, 2, [nonce]]
