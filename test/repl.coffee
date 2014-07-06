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

  historyFile = path.join __dirname, 'coffee_history_test'
  console.dir historyFile
  process.on 'exit', -> fs.unlinkSync historyFile

  testRepl = (desc, fn, testFn = test) ->
    input = new MockInputStream
    output = new MockOutputStream
    repl = Repl.start {input, output, historyFile}
    testFn desc, -> fn input, output, repl
    repl.emit 'exit'

  testRepl.skip = (desc, fn) -> testRepl desc, fn, test.skip

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

  test 'reads history from persistence file', ->
    input = new MockInputStream
    output = new MockOutputStream
    fs.writeFileSync historyFile, '0\n1\n'
    repl = Repl.start {input, output, historyFile}
    arrayEq ['1', '0'], repl.rli.history

  testRepl.skip 'writes history to persistence file', (input, output, repl) -> # Fails in node <= 0.8.
    fs.writeFileSync historyFile, ''
    input.emitLine '2'
    input.emitLine '3'
    eq '2\n3\n', (fs.readFileSync historyFile).toString()

  testRepl '.history shows history', (input, output, repl) ->
    repl.rli.history = history = ['1', '2', '3']
    fs.writeFileSync historyFile, "#{history.join '\n'}\n"
    input.emitLine '.history'
    eq (history.reverse().join '\n'), output.lastWrite 1

  testRepl.skip '.clear clears history', (input, output, repl) -> # Fails in node <= 0.8.
    input = new MockInputStream
    output = new MockOutputStream
    fs.writeFileSync historyFile, ''
    repl = Repl.start {input, output, historyFile}
    input.emitLine '0'
    input.emitLine '1'
    eq '0\n1\n', (fs.readFileSync historyFile).toString()
    #arrayEq ['1', '0'], repl.rli.history
    input.emitLine '.clear'
    eq '.clear\n', (fs.readFileSync historyFile).toString()
    #arrayEq ['.clear'], repl.rli.history
