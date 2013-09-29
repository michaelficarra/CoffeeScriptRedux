suite 'Parser', ->

  setup ->
    @shouldParse = (input) -> doesNotThrow -> parse input
    @shouldNotParse = (input) -> throws -> parse input


  test 'empty program', -> @shouldParse ''
  test 'simple number', -> @shouldParse '0'

  test 'simple error', -> @shouldNotParse '0+'

  test 'jashkenas/coffee-script#1601', -> @shouldParse '@'

  test '#242: a very specifically spaced division, by itself', ->
    @shouldParse 'a[1]/ 1'

  test 'more oddly-spaced division', ->
    @shouldParse 'f(a /b)'

  test 'deeply nested expressions', ->
    @shouldParse '((((((((((((((((((((0))))))))))))))))))))'
    @shouldParse '++++++++++++++++++++0'

  test '#142 inconsistently indented object literal', ->
    inconsistently =
      indented:
               object:
                literal: yes
    eq inconsistently.indented.object.literal, yes

  test 'inconsistently indented if statement', ->
    nonceA = {}
    nonceB = {}

    fn = (b) ->
      if b
        nonceA
      else
           nonceB

    eq nonceA, fn 1
    eq nonceB, fn 0

  test 'inconsistent object literal dedent', ->
    @shouldNotParse '''
      obj =
           foo: 5
        bar: 6
    '''

  test 'inconsistent if statement dedent', ->
    @shouldNotParse '''
      f = ->
          if something
            'yup'
        else
          'nope'
    '''

  test 'windows line endings', ->
    @shouldParse 'if test\r\n  fn a\r\n\r\n  fn b'

  test 'strip leading spaces in heredocs', ->
    eq 'a\n  b\nc', '''
      a
        b
      c
    '''
    eq 'a\n  b\nc', '''
    a
      b
    c
    '''
    eq 'a\n  b\nc', '''
      a
        b
      c
      '''
    eq '  a\nb\n  c', '''
      a
    b
      c
      '''

    eq 'a\n  b\nc', """
      a
        b
      c
    """
    eq 'a\n  b\nc', """
    a
      b
    c
    """
    eq 'a\n  b\nc', """
      a
        b
      c
      """
    eq '  a\nb\n  c', """
      a
    b
      c
      """

  test 'strip leading spaces in heredocs with interpolations', ->
    a = 'd'
    b = 'e'
    c = 'f'

    eq 'd\n  e\nf', """
      #{a}
        #{b}
      #{c}
    """
    eq 'd\n  e\nf', """
    #{a}
      #{b}
    #{c}
    """
    eq 'd\n  e\nf', """
      #{a}
        #{b}
      #{c}
      """
    eq '  d\ne\n  f', """
      #{a}
    #{b}
      #{c}
      """

    eq "a\n  e\nc", """
      a
        #{b}
      c
    """
    eq "a\n  e\nc", """
    a
      #{b}
    c
    """
    eq "a\n  e\nc", """
      a
        #{b}
      c
      """
    eq '  a\ne\n  c', """
      a
    #{b}
      c
      """
