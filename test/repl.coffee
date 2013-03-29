suite 'REPL', ->

  Stream = require 'stream'

  class MockInputStream extends Stream
    constructor: ->

    readable: true

    resume: ->

    emitLine: (val) ->
      @emit 'data', new Buffer "#{val}\n"

  class MockOutputStream extends Stream
    constructor: ->
      @written = []

    writable: true

    write: (data) ->
      @written.push data

    lastWrite: (fromEnd) ->
      @written[@written.length - 1 - fromEnd].replace /\n$/, ''


  testRepl = (desc, fn) ->
    input = new MockInputStream
    output = new MockOutputStream
    Repl.start {input, output}
    test desc, -> fn input, output

  ctrlV = { ctrl: true, name: 'v'}


  testRepl 'starts with coffee prompt', (input, output) ->
    eq 'coffee> ', output.lastWrite 1

  testRepl 'writes eval to output', (input, output) ->
    input.emitLine '1+1'
    eq '2', output.lastWrite 1

  testRepl 'comments are ignored', (input, output) ->
    input.emitLine '1 + 1 #foo'
    eq '2', output.lastWrite 1

  testRepl 'output in inspect mode', (input, output) ->
    input.emitLine '"1 + 1\\n"'
    eq "'1 + 1\\n'", output.lastWrite 1

  testRepl "variables are saved", (input, output) ->
    input.emitLine 'foo = "foo"'
    input.emitLine 'foobar = "#{foo}bar"'
    eq "'foobar'", output.lastWrite 1

  testRepl 'empty command evaluates to undefined', (input, output) ->
    input.emitLine ''
    eq 'coffee> ', output.lastWrite 0
    eq 'coffee> ', output.lastWrite 2

  testRepl 'ctrl-v toggles multiline prompt', (input, output) ->
    input.emit 'keypress', null, ctrlV
    eq '------> ', output.lastWrite 0
    input.emit 'keypress', null, ctrlV
    eq 'coffee> ', output.lastWrite 0

  testRepl 'multiline continuation changes prompt', (input, output) ->
    input.emit 'keypress', null, ctrlV
    input.emitLine ''
    eq '....... ', output.lastWrite 0

  testRepl 'evaluates multiline', (input, output) ->
    # Stubs. Could assert on their use.
    output.cursorTo = output.clearLine = ->

    input.emit 'keypress', null, ctrlV
    input.emitLine 'do ->'
    input.emitLine '  1 + 1'
    input.emit 'keypress', null, ctrlV
    eq '2', output.lastWrite 1

  testRepl 'variables in scope are preserved', (input, output) ->
    input.emitLine 'a = 1'
    input.emitLine 'do -> a = 2'
    input.emitLine 'a'
    eq '2', output.lastWrite 1

  testRepl 'existential assignment of previously declared variable', (input, output) ->
    input.emitLine 'a = null'
    input.emitLine 'a ?= 42'
    eq '42', output.lastWrite 1

  testRepl 'keeps running after runtime error', (input, output) ->
    input.emitLine 'a = b'
    ok 0 <= (output.lastWrite 1).indexOf 'ReferenceError: b is not defined'
    input.emitLine 'a'
    ok 0 <= (output.lastWrite 1).indexOf 'ReferenceError: a is not defined'
    input.emitLine '0'
    eq '0', output.lastWrite 1
