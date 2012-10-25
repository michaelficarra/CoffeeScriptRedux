suite 'Comprehensions', ->

  test 'comprehensions with no body produce `undefined` for each entry', ->
    arrayEq (undefined for a in [0..9]), for b in [0..9] then

  test '#66: `throw` as the final expression in the body of a comprehension', ->
    (->) -> for a in [0..9] then throw {}
