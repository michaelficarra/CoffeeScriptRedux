suite 'Slices', ->

  setup ->
    @shared = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  test "basic slicing", ->
    arrayEq [7, 8, 9]   , @shared[7..9]
    arrayEq [2, 3]      , @shared[2...4]
    arrayEq [2, 3, 4, 5], @shared[2...6]

  test "slicing with variables as endpoints", ->
    [a, b] = [1, 4]
    arrayEq [1, 2, 3, 4], @shared[a..b]
    arrayEq [1, 2, 3]   , @shared[a...b]

  test "slicing with expressions as endpoints", ->
    [a, b] = [1, 3]
    arrayEq [2, 3, 4, 5, 6], @shared[(a+1)..2*b]
    arrayEq [2, 3, 4, 5]   , @shared[a+1...(2*b)]

  test "unbounded slicing", ->
    arrayEq [7, 8, 9]   , @shared[7..]
    arrayEq [8, 9]      , @shared[-2..]
    arrayEq [9]         , @shared[-1...]
    arrayEq [0, 1, 2]   , @shared[...3]
    arrayEq [0, 1, 2, 3], @shared[..-7]

    arrayEq @shared      , @shared[..-1]
    arrayEq @shared[0..8], @shared[...-1]

    #for a in [-@shared.length..@shared.length]
    #  arrayEq @shared[a..] , @shared[a...]
    #for a in [-@shared.length+1...@shared.length]
    #  arrayEq @shared[..a][...-1] , @shared[...a]

    arrayEq [1, 2, 3], [1, 2, 3][..]

  test "#930, #835, #831, #746 #624: inclusive slices to -1 should slice to end", ->
    arrayEq @shared, @shared[0..-1]
    arrayEq @shared, @shared[..-1]
    arrayEq @shared.slice(1,@shared.length), @shared[1..-1]

  test "string slicing", ->
    str = "abcdefghijklmnopqrstuvwxyz"
    ok str[1...1] is ""
    ok str[1..1] is "b"
    ok str[1...5] is "bcde"
    ok str[0..4] is "abcde"
    ok str[-5..] is "vwxyz"

  #test "#1722: operator precedence in unbounded slice compilation", ->
  #  list = [0..9]
  #  n = 2 # some truthy number in `list`
  #  arrayEq [0..n], list[..n]
  #  arrayEq [0..n], list[..n or 0]
  #  arrayEq [0..n], list[..if n then n else 0]

  #test "#2349: inclusive slicing to numeric strings", ->
  #  arrayEq [0, 1], [0..10][.."1"]
