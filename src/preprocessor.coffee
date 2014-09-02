{pointToErrorLocation} = require './helpers'
StringScanner = require 'StringScanner'


# TODO: better comments
# TODO: support win32-style line endings
# TODO: now that the preprocessor doesn't support streaming input, optimise the `process` method

@Preprocessor = class Preprocessor

  ws = '\\t\\x0B\\f\\r \\xA0\\u1680\\u180E\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF'
  INDENT = '\uEFEF'
  DEDENT = '\uEFFE'
  TERM   = '\uEFFF'

  constructor: (@options = {}) ->
    @preprocessed = ''
    # `base` is either `null` or a regexp that matches the base indentation
    @base = null
    # `indents` is an array of successive indentation characters.
    @indents = []
    @context = []

  @process: (input, options = {}) -> (new Preprocessor options).process input

  err: (c) ->
    token =
      switch c
        when INDENT
          'INDENT'
        when DEDENT
          'DEDENT'
        when TERM
          'TERM'
        else
          "\"#{c.replace /"/g, '\\"'}\""
    # This isn't perfect for error location tracking, but since we normally call this after a scan, it tends to work well.
    lines = @ss.str.substr(0, @ss.pos).split(/\n/) || ['']
    columns = if lines[lines.length-1]? then lines[lines.length-1].length else 0
    context = pointToErrorLocation @ss.str, lines.length, columns
    throw new Error "Unexpected #{token}\n#{context}"

  peek: -> if @context.length then @context[@context.length - 1] else null

  observe: (c) ->
    top = @peek()
    switch c
      # opening token is closing token
      when '"""', '\'\'\'', '"', '\'', '###', '`', '///', '/'
        if top is c then @context.pop()
        else @context.push c
      # strictly opening tokens
      when INDENT, '#', '#{', '[', '(', '{', '\\', 'regexp-[', 'regexp-(', 'regexp-{', 'heregexp-#', 'heregexp-[', 'heregexp-(', 'heregexp-{'
        @context.push c
      # strictly closing tokens
      when DEDENT
        (@err c) unless top is INDENT
        @indents.pop()
        @context.pop()
      when '\n'
        (@err c) unless top in ['#', 'heregexp-#']
        @context.pop()
      when ']'
        (@err c) unless top in ['[', 'regexp-[', 'heregexp-[']
        @context.pop()
      when ')'
        (@err c) unless top in ['(', 'regexp-(', 'heregexp-(']
        @context.pop()
      when '}'
        (@err c) unless top in ['#{', '{', 'regexp-{', 'heregexp-{']
        @context.pop()
      when 'end-\\'
        (@err c) unless top is '\\'
        @context.pop()
      else throw new Error "undefined token observed: " + c
    @context

  p: (s) ->
    if s? then @preprocessed = "#{@preprocessed}#{s}"
    s

  scan: (r) -> @p @ss.scan r

  consumeIndentation: ->
    if @ss.bol() or @scan /// (?:[#{ws}]* \n)+ ///
      @scan /// (?: [#{ws}]* (\#\#?(?!\#)[^\n]*)? \n )+ ///

      # consume base indentation
      if @base?
        if not (@ss.eos() or (@scan @base)?)
          throw new Error "inconsistent base indentation"
      else
        @base = /// #{@scan /// [#{ws}]* ///} ///

      # move through each level of indentation
      indentIndex = 0
      while indentIndex < @indents.length
        indent = @indents[indentIndex]
        if @ss.check /// #{indent} ///
          # an existing indent
          @scan /// #{indent} ///
        else if @ss.eos() or @ss.check /// [^#{ws}] ///
          # we lost an indent
          --indentIndex
          @p "#{DEDENT}#{TERM}"
          @observe DEDENT
        else
          # Some ambiguous dedent
          lines = @ss.str.substr(0, @ss.pos).split(/\n/) || ['']
          message = "Syntax error on line #{lines.length}: indentation is ambiguous"
          lineLen = @indents.reduce ((l, r) -> l + r.length), 0
          context = pointToErrorLocation @ss.str, lines.length, lineLen
          throw new Error "#{message}\n#{context}"
        ++indentIndex
      if @ss.check /// [#{ws}]+ [^#{ws}#] ///
        # an indent
        @indents.push @scan /// [#{ws}]+ ///
        @p INDENT
        @observe INDENT

  introduceContext: ->
    if tok = @scan /"""|'''|\/\/\/|###|["'`#[({\\]/
      @observe tok
    else if tok = @scan /\//
      # unfortunately, we must look behind us to determine if this is a regexp or division
      pos = @ss.position()
      if pos > 1
        lastChar = @ss.string()[pos - 2]
        spaceBefore = ///[#{ws}]///.test lastChar
        impliedRegexp = /[;,=><*%^&|[(+!~-]/.test lastChar
      if pos is 1 or impliedRegexp or spaceBefore and not (@ss.check ///[#{ws}=]///) and @ss.check /[^\r\n]*\//
        @observe '/'

  process: (input) ->
    if @options.literate
      input = input.replace /^( {0,3}\S)/gm, '    #$1'
    @ss = new StringScanner input

    until @ss.eos()
      switch @peek()

        when null, INDENT
          @consumeIndentation()
          @scan /[^\n'"\\\/#`[(){}\]]+/
          if @ss.check /[})\]]/
            while @peek() is INDENT
              @p "#{DEDENT}#{TERM}"
              @observe DEDENT
            @observe @scan /[})\]]/
          else
            @introduceContext()

        when '#{', '{'
          @scan /[^\n'"\\\/#`[({}]+/
          if tok = @scan /\}/
            @observe tok
          else
            @consumeIndentation()
            @introduceContext()
        when '['
          @scan /[^\n'"\\\/#`[({\]]+/
          if tok = @scan /\]/
            @observe tok
          else
            @consumeIndentation()
            @introduceContext()
        when '('
          @scan /[^\n'"\\\/#`[({)]+/
          if tok = @scan /\)/
            @observe tok
          else
            @consumeIndentation()
            @introduceContext()

        when '\\'
          # skip CR for Windows compatibility
          @ss.scan /[\r]/
          if (@scan /[\s\S]/) then @observe 'end-\\'
          # TODO: somehow prevent indent tokens from being inserted after these newlines
        when '"""'
          @scan /(?:[^"#\\]+|""?(?!")|#(?!{)|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /#{|"""/ then @observe tok
          else if tok = @scan /#{|"""/ then @observe tok
        when '"'
          @scan /(?:[^"#\\]+|#(?!{)|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /#{|"/ then @observe tok
        when '\'\'\''
          @scan /(?:[^'\\]+|''?(?!')|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /'''/ then @observe tok
        when '\''
          @scan /(?:[^'\\]+|\\.)+/
          @ss.scan /\\\n/
          if tok = @scan /'/ then @observe tok
        when '###'
          @scan /(?:[^#]+|##?(?!#))+/
          if tok = @scan /###/ then @observe tok
        when '#'
          @scan /[^\n]+/
          if tok = @scan /\n/ then @observe tok
        when '`'
          @scan /[^`]+/
          if tok = @scan /`/ then @observe tok
        when '///'
          @scan /(?:[^[/#\\]+|\/\/?(?!\/)|\\.)+/
          if tok = @scan /#{|\/\/\/|\\/ then @observe tok
          else if @ss.scan /#/ then @observe 'heregexp-#'
          else if tok = @scan /[\[]/ then @observe "heregexp-#{tok}"
        when 'heregexp-['
          @scan /(?:[^\]\/\\]+|\/\/?(?!\/))+/
          if tok = @scan /[\]\\]|#{|\/\/\// then @observe tok
        when 'heregexp-#'
          @ss.scan /(?:[^\n/]+|\/\/?(?!\/))+/
          if tok = @scan /\n|\/\/\// then @observe tok
        #when 'heregexp-('
        #  @scan /(?:[^)/[({#\\]+|\/\/?(?!\/))+/
        #  if tok = @ss.scan /#(?!{)/ then @observe 'heregexp-#'
        #  else if tok = @scan /[)\\]|#{|\/\/\// then @observe tok
        #  else if tok = @scan /[[({]/ then @observe "heregexp-#{tok}"
        #when 'heregexp-{'
        #  @scan /(?:[^}/[({#\\]+|\/\/?(?!\/))+/
        #  if tok = @ss.scan /#(?!{)/ then @observe 'heregexp-#'
        #  else if tok = @scan /[}/\\]|#{|\/\/\// then @observe tok
        #  else if tok = @scan /[[({]/ then @observe "heregexp-#{tok}"
        when '/'
          @scan /[^[/\\]+/
          if tok = @scan /[\/\\]/ then @observe tok
          else if tok = @scan /\[/ then @observe "regexp-#{tok}"
        when 'regexp-['
          @scan /[^\]\\]+/
          if tok = @scan /[\]\\]/ then @observe tok
        #when 'regexp-('
        #  @scan /[^)/[({\\]+/
        #  if tok = @scan /[)/\\]/ then @observe tok
        #  else if tok = @scan /[[({]/ then @observe "regexp-#{tok}"
        #when 'regexp-{'
        #  @scan /[^}/[({\\]+/
        #  if tok = @scan /[}/\\]/ then @observe tok
        #  else if tok = @scan /[[({]/ then @observe "regexp-#{tok}"

    # reached the end of the file
    @scan /// [#{ws}\n]* $ ///
    while @context.length
      switch @peek()
        when INDENT
          @p "#{DEDENT}#{TERM}"
          @observe DEDENT
        when '#'
          @p '\n'
          @observe '\n'
        else
          # TODO: store offsets of tokens when inserted and report position of unclosed starting token
          throw new Error "Unclosed \"#{@peek().replace /"/g, '\\"'}\" at EOF"

    @preprocessed
