fs = require 'fs'
{EventEmitter} = require 'events'
{formatParserError} = require './helpers'
StringScanner = require 'StringScanner'

inspect = (o) -> (require 'util').inspect o, no, 9e9, yes


# TODO: better comments
# TODO: support win32-style line endings

@Preprocessor = class Preprocessor extends EventEmitter

  ws = '\\t\\x0B\\f \\xA0\\u1680\\u180E\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF'
  INDENT = '\uEFEF'
  DEDENT = '\uEFFE'
  TERM   = '\uEFFF'

  constructor: ->
    # `base` is either `null` or a regexp that matches the base indentation
    # `indent` is either `null` or the characters that make up one indentation
    @base = @indent = null
    @context = []
    @context.peek = -> if @length then this[@length - 1] else null
    @context.err = (c) ->
      throw new Error "Unexpected " + inspect c
    @context.observe = (c) ->
      top = @peek()
      switch c
        # opening token is closing token
        when '"""', '\'\'\'', '"', '\'', '###', '`', '///', '/'
          if top is c then do @pop
          else @push c
        # strictly opening tokens
        when INDENT, '#', '#{', '[', '(', '{', '\\', 'regexp-[', 'regexp-(', 'regexp-{', 'heregexp-#', 'heregexp-[', 'heregexp-(', 'heregexp-{'
          @push c
        # strictly closing tokens
        when DEDENT
          (@err c) unless top is INDENT
          do @pop
        when '\n'
          (@err c) unless top in ['#', 'heregexp-#']
          do @pop
        when ']'
          (@err c) unless top in ['[', 'regexp-[', 'heregexp-[']
          do @pop
        when ')'
          (@err c) unless top in ['(', 'regexp-(', 'heregexp-(']
          do @pop
        when '}'
          (@err c) unless top in ['#{', '{', 'regexp-{', 'heregexp-{']
          do @pop
        when 'end-\\'
          (@err c) unless top is '\\'
          do @pop
        else throw new Error "undefined token observed: " + c
      this
    @ss = new StringScanner ''

  p: (s) ->
    if s? then @emit 'data', s
    s

  scan: (r) -> @p @ss.scan r

  processInput = (isEnd) -> (data) ->
    @ss.concat data unless isEnd

    until @ss.eos()
      switch @context.peek()
        when null, INDENT, '#{', '[', '(', '{'
          if @ss.bol() or @scan /// (?:[#{ws}]* \n)+ ///

            @scan /// (?: [#{ws}]* (\#\#?(?!\#)[^\n]*)? \n )+ ///

            # we might require more input to determine indentation
            return if not isEnd and (@ss.check /// [#{ws}\n]* $ ///)?

            if @base?
              unless (@scan @base)?
                throw new Error "inconsistent base indentation"
            else
              @base = /// #{@scan /// [#{ws}]* ///} ///

            if @indent?
              level = (0 for c in @context when c is INDENT).length
              # a single indent
              if @ss.check /// (?:#{@indent}){#{level + 1}} [^#{ws}#] ///
                @scan /// (?:#{@indent}){#{level + 1}} ///
                @context.observe INDENT
                @p INDENT
              # one or more dedents
              else if level > 0 and @ss.check /// (?:#{@indent}){0,#{level - 1}} [^#{ws}] ///
                newLevel = 0
                ++newLevel while @scan /// #{@indent} ///
                delta = level - newLevel
                while delta--
                  @context.observe DEDENT
                  @p "#{DEDENT}#{TERM}"
              # unchanged indentation level
              else if @ss.check /// (?:#{@indent}){#{level}} [^#{ws}] ///
                @scan /// (?:#{@indent}){#{level}} ///
              else
                lines = @ss.str.substr(0, @ss.pos).split(/\n/) || ['']
                throw new Error formatParserError @ss.str, {
                  line: lines.length
                  column: 1 + lines[lines.length - 1].length
                  found: "indentation at level #{level}"
                }
            else if @ss.check /// [#{ws}]+ [^#{ws}#] ///
              # first indentation
              @indent = @scan /// [#{ws}]+ ///
              @context.observe INDENT
              @p INDENT

          tok = switch @context.peek()
            when '['
              # safe things, but not closing bracket
              @scan /[^\n'"\\\/#`[({\]]+/
              @scan /\]/
            when '('
              # safe things, but not closing paren
              @scan /[^\n'"\\\/#`[({)]+/
              @scan /\)/
            when '#{', '{'
              # safe things, but not closing brace
              @scan /[^\n'"\\\/#`[({}]+/
              @scan /\}/
            else
              # scan safe characters (anything that doesn't *introduce* context)
              @scan /[^\n'"\\\/#`[({]+/
              null
          if tok
            @context.observe tok
            continue

          if tok = @scan /"""|'''|\/\/\/|###|["'`#[({\\]/
            @context.observe tok
          else if tok = @scan /\//
            # unfortunately, we must look behind us to determine if this is a regexp or division
            pos = @ss.position()
            if pos > 1
              lastChar = @ss.string()[pos - 2]
              spaceBefore = ///[#{ws}]///.test lastChar
              nonIdentifierBefore = /[\W_$]/.test lastChar # TODO: this should perform a real test
            if pos is 1 or (if spaceBefore then not @ss.check /// [#{ws}=] /// else nonIdentifierBefore)
              @context.observe '/'

        when '\\'
          if (@scan /[\s\S]/) then @context.observe 'end-\\'
          # TODO: somehow prevent indent tokens from being inserted after these newlines
        when '"""'
          @scan /(?:[^"#\\]+|""?(?!")|#(?!{)|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /#{|"""/ then @context.observe tok
          else if tok = @scan /#{|"""/ then @context.observe tok
        when '"'
          @scan /(?:[^"#\\]+|#(?!{)|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /#{|"/ then @context.observe tok
        when '\'\'\''
          @scan /(?:[^'\\]+|''?(?!')|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /'''/ then @context.observe tok
        when '\''
          @scan /(?:[^'\\]+|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /'/ then @context.observe tok
        when '###'
          @scan /(?:[^#]+|##?(?!#))+/
          if tok = @scan /###/ then @context.observe tok
        when '#'
          @scan /[^\n]+/
          if tok = @scan /\n/ then @context.observe tok
        when '`'
          @scan /[^`]+/
          if tok = @scan /`/ then @context.observe tok
        when '///'
          @scan /(?:[^[/#\\]+|\/\/?(?!\/)|\\.)+/
          if tok = @scan /#{|\/\/\/|\\/ then @context.observe tok
          else if @ss.scan /#/ then @context.observe 'heregexp-#'
          else if tok = @scan /[\[]/ then @context.observe "heregexp-#{tok}"
        when 'heregexp-['
          @scan /(?:[^\]\/\\]+|\/\/?(?!\/))+/
          if tok = @scan /[\]\\]|#{|\/\/\// then @context.observe tok
        when 'heregexp-#'
          @ss.scan /(?:[^\n/]+|\/\/?(?!\/))+/
          if tok = @scan /\n|\/\/\// then @context.observe tok
        #when 'heregexp-('
        #  @scan /(?:[^)/[({#\\]+|\/\/?(?!\/))+/
        #  if tok = @ss.scan /#(?!{)/ then @context.observe 'heregexp-#'
        #  else if tok = @scan /[)\\]|#{|\/\/\// then @context.observe tok
        #  else if tok = @scan /[[({]/ then @context.observe "heregexp-#{tok}"
        #when 'heregexp-{'
        #  @scan /(?:[^}/[({#\\]+|\/\/?(?!\/))+/
        #  if tok = @ss.scan /#(?!{)/ then @context.observe 'heregexp-#'
        #  else if tok = @scan /[}/\\]|#{|\/\/\// then @context.observe tok
        #  else if tok = @scan /[[({]/ then @context.observe "heregexp-#{tok}"
        when '/'
          @scan /[^[/\\]+/
          if tok = @scan /[\/\\]/ then @context.observe tok
          else if tok = @scan /\[/ then @context.observe "regexp-#{tok}"
        when 'regexp-['
          @scan /[^\]\\]+/
          if tok = @scan /[\]\\]/ then @context.observe tok
        #when 'regexp-('
        #  @scan /[^)/[({\\]+/
        #  if tok = @scan /[)/\\]/ then @context.observe tok
        #  else if tok = @scan /[[({]/ then @context.observe "regexp-#{tok}"
        #when 'regexp-{'
        #  @scan /[^}/[({\\]+/
        #  if tok = @scan /[}/\\]/ then @context.observe tok
        #  else if tok = @scan /[[({]/ then @context.observe "regexp-#{tok}"

    # reached the end of the file
    if isEnd
      @scan /// [#{ws}\n]* $ ///
      while @context.length and INDENT is @context.peek()
        @context.observe DEDENT
        @p "#{DEDENT}#{TERM}"
      if @context.length
        # TODO: store offsets of tokens when inserted and report position of unclosed starting token
        throw new Error 'Unclosed ' + (inspect @context.peek()) + ' at EOF'
      @emit 'end'
      return

    return

  processData: processInput no
  processEnd: processInput yes
  @processSync = (input) ->
    pre = new Preprocessor
    output = ''
    pre.emit = (type, data) -> output += data if type is 'data'
    pre.processData input
    do pre.processEnd
    output
