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

  test 'multiline program', ->
    @shouldParse 'a\nb'
  test 'indented expressions', ->
    @shouldParse 'a or\n  b'
    @shouldParse 'a or\n\tb'
