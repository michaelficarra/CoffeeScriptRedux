suite 'Error Messages', ->

  test 'patched stack trace prelude consistency with V8', ->
    err0 = new Error
    err1 = new Error 'message'
    eq 'Error\n', err0.stack[...6]
    eq 'Error: message\n', err1.stack[...15]
