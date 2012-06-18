fs = require 'fs'
{EventEmitter} = require 'events'
StringScanner = require 'cjs-string-scanner'

inspect = (o) -> console.log (require 'util').inspect o, no, 9e9, yes

ws = '\\t\\x0B\\f \\xA0\\u1680\\u180E\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF'
INDENT = '\uEFEF'
DEDENT = '\uEFFE'


class @Preprocessor extends EventEmitter
  constructor: ->
    @base = @indent = null
    @level = 0
    @ss = new StringScanner ''

  p: (s) ->
    if s? then @emit 'data', s
    s

  scan: (r) -> @p @ss.scan r

  # TODO: interpolations may have indentation
  # TODO: preserve line numbers for errors

  processInput = (isEnd) -> (data) ->
    @ss.concat data unless isEnd

    if (@ss.check /// [#{ws}]* $ ///)?
      return unless isEnd
      @scan /// [#{ws}]* $ ///
      @emit 'end'
      return

    if @ss.bol()

      # ignore whitespace-only lines
      @scan /// (?:[#{ws}]* (?:\n|$))+ ///

      if @base?
        unless (@scan @base)?
          throw new Error "inconsistent base indentation"
      else
        return unless (@ss.exists /// [^#{ws}\n] ///)?
        # ignore leading whitespace-only lines
        @scan /// (?:[#{ws}]* (\n|$))+ ///
        b = @scan /// [#{ws}]* ///
        @base = /// #{b ? ''} ///

      if @indent?
        # a single indent
        if @ss.check /// (?:#{@indent}){#{@level + 1}} [^#{ws}] ///
          @scan /// (?:#{@indent}){#{@level + 1}} ///
          ++@level
          @p INDENT
        # one or more dedents
        else if @level > 0 and @ss.check /// (?:#{@indent}){0,#{@level - 1}} [^#{ws}] ///
          newLevel = 0
          ++newLevel while @scan /// #{@indent} ///
          delta = @level - newLevel
          @p "#{DEDENT}\n" while delta--
          @level = newLevel
        # unchanged indentation level
        else if @ss.check /// (?:#{@indent}){#{@level}} [^#{ws}] ///
          @scan /// (?:#{@indent}){#{@level}} ///
        else
          throw new Error "invalid indentation"
      else if @ss.check /// [#{ws}] ///
        # first indentation
        @indent = @scan /// [#{ws}]+ ///
        @p INDENT
        @level = 1

    # scan through all that junk after the indentation
    while @scan /// [^\n'"\\\/\#`]+ /// # don't pass over anything that could begin something that could safely contain newlines
      @ss.scan /// \\\n[#{ws}]* /// # ignore newlines preceded by backslashes
      @scan /###([^#][\s\S]*?)(?:###[^\n\S]*|(?:###)?$)|^(?:\s*#(?!##[^#]).*)+/ # comments
      @scan /// ("""|''') [\s\S]*? \1 /// # heredoc
      @scan /"(?:[^"\\]+|\\.)*"|'(?:[^'\\]+|\\.)*'/ # string
      @scan /// ^ /{3} ([\s\S]+?) /{3} ([imgy]{0,4}) (?!\w) /// # heregex
      @scan /`(?:[^`\\]+|\\.)*`/ # JS literal

    if @scan /\n/
      if isEnd then @processEnd()
      else @processData ''


  processData: processInput no
  processEnd: processInput yes
