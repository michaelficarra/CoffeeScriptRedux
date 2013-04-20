fs = require 'fs'
path = require 'path'
vm = require 'vm'
nodeREPL = require 'repl'
CoffeeScript = require './module'
CS = require './nodes'
{merge} = require './helpers'

addMultilineHandler = (repl) ->
  {rli, inputStream, outputStream} = repl
  initialPrompt = repl.prompt.replace /^[^> ]*/, (x) -> x.replace /./g, '-'
  continuationPrompt = repl.prompt.replace /^[^> ]*>?/, (x) -> x.replace /./g, '.'

  enabled = no
  buffer = ''

  # Proxy node's line listener
  nodeLineListener = (rli.listeners 'line')[0]
  rli.removeListener 'line', nodeLineListener
  rli.on 'line', (cmd) ->
    if enabled
      buffer += "#{cmd}\n"
      rli.setPrompt continuationPrompt
      rli.prompt true
    else
      nodeLineListener cmd
    return

  # Handle Ctrl-v
  inputStream.on 'keypress', (char, key) ->
    return unless key and key.ctrl and not key.meta and not key.shift and key.name is 'v'
    if enabled
      # allow arbitrarily switching between modes any time before multiple lines are entered
      unless buffer.match /\n/
        enabled = not enabled
        rli.setPrompt repl.prompt
        rli.prompt true
        return
      # no-op unless the current line is empty
      return if rli.line? and not rli.line.match /^\s*$/
      # eval, print, loop
      enabled = not enabled
      rli.line = ''
      rli.cursor = 0
      rli.output.cursorTo 0
      rli.output.clearLine 1
      # XXX: multiline hack
      buffer = buffer.replace /\n/g, '\uFF00'
      rli.emit 'line', buffer
      buffer = ''
    else
      enabled = not enabled
      rli.setPrompt initialPrompt
      rli.prompt true
    return

# store and load command history from a file
addHistory = (repl, filename, maxSize) ->
  try
    stat = fs.statSync filename
    size = Math.min maxSize, stat.size
    readFd = fs.openSync filename, 'r'
    buffer = new Buffer size
    # read last `size` bytes from the file
    fs.readSync readFd, buffer, 0, size, stat.size - size if size
    repl.rli.history = (buffer.toString().split '\n').reverse()
    # if the history file was truncated we should pop off a potential partial line
    do repl.rli.history.pop if stat.size > maxSize
    # shift off the final blank newline
    do repl.rli.history.shift if repl.rli.history[0] is ''
    repl.rli.historyIndex = -1
  catch e
    repl.rli.history = []

  fd = fs.openSync filename, 'a'

  # like readline's history, we do not want any adjacent duplicates
  lastLine = repl.rli.history[0]

  # save new commands to the history file
  repl.rli.addListener 'line', (code) ->
    if code and code isnt lastLine
      lastLine = code
      fs.writeSync fd, "#{code}\n"

  repl.rli.on 'exit', -> fs.closeSync fd

  # .clear should also clear history
  original_clear = repl.commands['.clear'].action
  repl.commands['.clear'].action = ->
    repl.outputStream.write 'Clearing history...\n'
    repl.rli.history = []
    fs.closeSync fd
    fd = fs.openSync filename, 'w'
    lastLine = undefined
    original_clear.call this

  # add a command to show the history stack
  repl.commands['.history'] =
    help: 'Show command history'
    action: ->
      repl.outputStream.write "#{repl.rli.history[..].reverse().join '\n'}\n"
      do repl.displayPrompt

module.exports =
  start: (opts = {}) ->
    # REPL defaults
    opts.prompt or= 'coffee> '
    opts.ignoreUndefined ?= yes
    opts.historyFile ?= path.join process.env.HOME, '.coffee_history'
    opts.historyMaxInputSize ?= 10 * 1024 # 10KiB
    opts.eval or= (input, context, filename, cb) ->
      # XXX: multiline hack
      input = input.replace /\uFF00/g, '\n'
      # strip parens added by node
      input = input.replace /^\(([\s\S]*)\n\)$/m, '$1'
      # strip single-line comments
      input = input.replace /(^|[\r\n]+)(\s*)##?(?:[^#\r\n][^\r\n]*|)($|[\r\n])/, '$1$2$3'
      # empty command
      return cb null if /^\s*$/.test input
      try
        inputAst = CoffeeScript.parse input, {filename, raw: yes}
        transformedAst = new CS.AssignOp (new CS.Identifier '_'), inputAst.body
        jsAst = CoffeeScript.compile transformedAst, bare: yes, inScope: Object.keys context
        js = CoffeeScript.js jsAst
        cb null, vm.runInContext js, context, filename
      catch err
        cb "\x1B[0;31m#{err.constructor.name}: #{err.message}\x1B[0m"

    repl = nodeREPL.start opts
    repl.on 'exit', -> repl.outputStream.write '\n'
    addMultilineHandler repl
    if opts.historyFile
      addHistory repl, opts.historyFile, opts.historyMaxInputSize
    repl
