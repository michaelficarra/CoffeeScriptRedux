suite 'Parser', ->

  setup ->
    @shouldParse = (input) -> doesNotThrow -> parse input
    @shouldNotParse = (input) -> throws -> parse input
    @checkNodeRaw = (node, source) =>
      rawAtOffset = source[node.offset...(node.offset + node.raw.length)]
      if node.raw isnt rawAtOffset
        fail "expected #{node.className} raw to equal #{JSON.stringify(rawAtOffset)}, but was #{JSON.stringify(node.raw)}"
      for own prop, child of node
        if Array.isArray child
          @checkNodeRaw element, source for element in child
        else if child instanceof CoffeeScript.Nodes.Nodes
          @checkNodeRaw child, source


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

  suite 'raw value preservation', ->

    test 'basic indentation', ->
      ast = parse '''
      fn = ->
        body
      ''', raw: yes
      eq 'fn = ->\n  body', ast.raw

    test 'numbers', ->
      ast = parse '0x0', raw: yes
      eq '0x0', ast.body.statements[0].raw

    test 'strings', ->
      ast = parse '"aaaaaa#{bbbbbb}cccccc"', raw: yes
      eq 'aaaaaa', ast.body.statements[0].left.left.raw
      eq 'cccccc', ast.body.statements[0].right.raw

    test 'empty string interpolation prefix', ->
      ast = parse '"#{0}"', raw: yes
      eq '', ast.body.statements[0].left.raw

  suite 'position/offset preservation', ->

    test 'basic indentation', ->
      source = '''
      fn = ->
        body
      '''
      ast = parse source, raw: yes
      @checkNodeRaw ast, source
