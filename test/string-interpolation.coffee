suite 'String Interpolation', ->

  test 'interpolate one string variable', ->
    b = 'b'
    eq 'abc', "a#{b}c"

  test 'interpolate two string variables', ->
    b = 'b'
    c = 'c'
    eq 'abcd', "a#{b}#{c}d"

  test 'interpolate one numeric variable in the middle of the string', ->
    b = 0
    eq 'a0c', "a#{b}c"

  test 'interpolate one numeric variable at the start of the string', ->
    a = 0
    eq '0bc', "#{a}bc"

  test 'interpolate one numeric variable at the end of the string', ->
    c = 0
    eq 'ab0', "ab#{c}"

  test 'interpolations always produce a string', ->
    eq '0', "#{0}"
    eq 'string', typeof "#{0 + 1}"

  test 'interpolate a function call', ->
    b = -> 'b'
    eq 'abc', "a#{b()}c"
    eq 'abc', "a#{b 0}c"

  test 'interpolate a math expression (add)', ->
    eq 'a5c', "a#{2 + 3}c"

  test 'interpolate a math expression (subtract)', ->
    eq 'a2c', "a#{5 - 3}c"

  test 'interpolate a math expression (multiply)', ->
    eq 'a6c', "a#{2 * 3}c"

  test 'interpolate a math expression (divide)', ->
    eq 'a2c', "a#{4 / 2}c"

  test 'nested interpolation with double quotes', ->
    b = 'b'
    c = 'c'
    eq 'abcd', "a#{b + "#{c}"}d"

  test 'nested interpolation with single quotes (should not interpolate)', ->
    b = 'b'
    c = 'c'
    eq 'ab#{c}d', "a#{b + '#{c}'}d"

  test 'multiline interpolation', ->
    b = 'b'

    eq "a
    b
    c
    ", "a
    #{b}
    c
    "
    eq """
      a
      b
      c
    """, """
      a
      #{b}
      c
    """
