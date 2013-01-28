vm = require 'vm'
nodeREPL = require 'repl'
CoffeeScript = require './module'
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

module.exports =
  start: (opts = {}) ->
    # REPL defaults
    opts.prompt or= 'coffee> '
    opts.eval or= (input, context, filename, cb) ->
      # XXX: multiline hack
      input = input.replace /\uFF00/g, '\n'
      # strip single-line comments
      input = input.replace /(^|[\r\n]+)(\s*)##?(?:[^#\r\n][^\r\n]*|)($|[\r\n])/, '$1$2$3'
      # empty command
      return cb null if /^(\s*|\(\s*\))$/.test input
      # TODO: fix #1829: pass in-scope vars and avoid accidentally shadowing them by omitting those declarations
      try
        js = CoffeeScript.cs2js "_=(#{input}\n)", {filename, bare: yes}
        cb null, vm.runInContext js, context, filename
      catch err
        cb "\x1B[0;31m#{err.constructor.name}: #{err.message}\x1B[0m"

    repl = nodeREPL.start opts
    repl.on 'exit', -> repl.outputStream.write '\n'
    addMultilineHandler repl
    repl
