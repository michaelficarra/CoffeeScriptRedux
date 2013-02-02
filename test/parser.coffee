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
    f = (b) ->
      if b
        'if'
      else
           'else'
    eq 'if', f yes
    eq 'else', f no

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
