suite 'Comprehensions', ->

  test 'comprehensions with no body produce `undefined` for each entry', ->
    arrayEq (undefined for a in [0..9]), for b in [0..9] then

  test '#66: `throw` as the final expression in the body of a comprehension', ->
    (->) -> for a in [0..9] then throw {}

  test 'comprehensions over static, integral ranges', ->
    arrayEq [0..9], (a for a in [0..9])
    arrayEq [0...9], (a for a in [0...9])

  test '#234: value may be omitted in for-in comprehensions', ->
    arrayEq [0, 0, 0, 0], (0 for in [0..3])
    c = 0
    fn = -> c++
    arrayEq [0..9], (fn() for in [0..9])
    a = 0
    b = 9
    c = 0
    arrayEq [a..b], (fn() for in [a..b])
    c = 0
    arrayEq [a...b], (fn() for in [a...b])

  test 'filtered comprehensions', ->
    list = [0..5]
    arrayEq [1, 3, 5], (a for a in list when a & 1)
    arrayEq [0..3], (a for a in list when a < 4)

  test '#285: filtered comprehensions over ranges', ->
    arrayEq [1, 3, 5], (a for a in [0..5] when a & 1)
    arrayEq [0..3], (a for a in [0..5] when a < 4)

  test 'comprehension over range with index', ->
    arrayEq [0..3], (k for v, k in [5..8])
    arrayEq [5..8], (v for v, k in [5..8])

  test '#286: stepped loops', ->
    list = [1..7]
    arrayEq [1, 4, 7], (v for v in list by 3)
    arrayEq [1, 4, 7], (v for v in [1..7] by 3)
    arrayEq [0, 3, 6], (k for v, k in list by 3)
    arrayEq [0, 3, 6], (k for v, k in [1..7] by 3)
    arrayEq [0, 0, 0], (0 for in list by 3)
    arrayEq [0, 0, 0], (0 for in [1..7] by 3)

  test '#284: loops/comprehensions over decreasing ranges don\'t work', ->
    a = 2
    b = -2
    arrayEq [5, 4, 3, 2, 1], (n for n in [5..1])
    arrayEq [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5], (n for n in [5..-5])
    arrayEq [2, 1, 0, -1, -2], (n for n in [a..b])
    arrayEq [2, 1, 0, -1, -2], (n for n in [a..-2])
    arrayEq [2, 1, 0, -1, -2], (n for n in [2..b])

    arrayEq [5, 4, 3, 2], (n for n in [5...1])
    arrayEq [2, 1, 0, -1], (n for n in [a...b])
    arrayEq [2, 1, 0, -1], (n for n in [a...-2])
    arrayEq [2, 1, 0, -1], (n for n in [2...b])
