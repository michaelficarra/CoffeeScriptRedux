suite 'Parser', ->

  setup ->
    @shouldParse = (input) -> doesNotThrow -> parse input
    @shouldNotParse = (input) -> throws -> parse input


  test 'empty program', -> @shouldParse ''
  test 'simple number', -> @shouldParse '0'

  test 'simple error', -> @shouldNotParse '0+'

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
