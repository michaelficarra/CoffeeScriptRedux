fs = require 'fs'
{EventEmitter} = require 'events'
StringScanner = require 'cjs-string-scanner'

inspect = (o) -> console.log (require 'util').inspect o, no, 9e9, yes

ws = '\\t\\x0B\\f \\xA0\\u1680\\u180E\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF'
INDENT = '\uEFEF'
DEDENT = '\uEFFE'


class @Preprocessor extends EventEmitter
  constructor: ->
    # `base` is either `null` or a regexp that matches the base indentation
    # `indent` is either `null` or the characters that make up one indentation
    @base = @indent = null
    @level = 0
    @ss = new StringScanner ''

  p: (s) ->
    if s? then @emit 'data', s
    s

  scan: (r) -> @p @ss.scan r

  # TODO: interpolations may have indentation

  processInput = (isEnd) -> (data) ->
    @ss.concat data unless isEnd

    if (@ss.check /// [#{ws}\n]* $ ///)?
      return unless isEnd
      @scan /// [#{ws}\n]* $ ///
      @p "#{DEDENT}\n" while @level-- if @level > 0
      @emit 'end'
      return

    if @ss.bol()

      # ignore whitespace-only lines
      @scan /// (?:[#{ws}]* \n)+ ///

      if @base?
        unless (@scan @base)?
          throw new Error "inconsistent base indentation"
      else
        return unless (@ss.check /// [^#{ws}\n] ///)?
        b = @scan /// [#{ws}]* ///
        @base = /// #{b} ///

      if not isEnd and (@ss.check /// [#{ws}]* $ ///)?
        return
      else if @indent?
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
          # TODO: show expected indentation, also line number
          throw new Error "invalid indentation"
      else if @ss.check /// [#{ws}]+ [^#{ws}] ///
        # first indentation
        @indent = @scan /// [#{ws}]+ ///
        @p INDENT
        @level = 1

    # scan through all that junk after the indentation
    continue while false or
      (@scan /(?:[^\n'"\\\/\#`]+|\/\/?[^\/])+/) or # don't pass over anything that could begin something that could safely contain newlines
      (@ss.scan /\\\n/) or # ignore newlines preceded by backslashes
      (@ss.scan /#(?!##[^#]).*/) or # single-line comments
      (@scan /###[^#][\s\S]*?###/) or # multi-line comments
      # TODO: should this be so naive?
      (@scan /// ("""|''') [\s\S]*? \1 ///) or # heredoc
      (@scan /"(?:[^"\\]+|\\.)*"|'(?:[^'\\]+|\\.)*'/) or # string
      (@scan /// ^ /{3} ([\s\S]+?) /{3} ([imgy]{0,4}) (?!\w) ///) or # heregex
      (@scan /`(?:[^`\\]+|\\.)*`/) or # JS literal
      false

    if isEnd then processEnd()
    else if @scan /// (?:[#{ws}]* \n)+ /// then @processData ''


  processData: processInput no
  processEnd: processInput yes
