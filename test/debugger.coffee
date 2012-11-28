suite 'Debugger', ->

  setup ->
    @shouldParse = (input) -> doesNotThrow -> parse input
    @shouldNotParse = (input) -> throws -> parse input

  test 'should parse', ->
    @shouldParse 'debugger'

  test 'cannot be used as value', ->
    @shouldNotParse 'x = debugger'

  test 'function with debugger as last statement', ->
    debugger

  test 'function with conditional debugger as last statement', ->
    x = true
    if x then debugger
