suite 'Regular Expressions', ->

  test 'differentiate regexps from division', ->
    a = -> 0
    a.valueOf = -> 1
    b = i = 1

    eq 1, a / b
    eq 1, a/ b
    eq 1, a/b
    eq 1, a / b / i
    eq 1, a/ b / i
    eq 1, a / b/ i
    eq 1, a / b /i
    eq 1, a/b / i
    eq 1, a/ b/ i
    eq 1, a/ b /i
    eq 1, a/b/ i
    eq 1, a/ b/i
    eq 1, a/b/i
    eq 1, b /= a
    eq 1, b/=a/i
    eq 1, b /=a/i
    eq 1, b /=a
    i=/a/i
    a[/a/]

    eq 0, a /b/i
    eq 0, a(/b/i)
    eq 0, a /b /i

  test 'regexps can start with spaces and = when unambiguous', ->
    a = -> 0
    eq 0, a(/ b/i)
    eq 0, a(/= b/i)
    eq 0, a a[/ b/i]
    eq 0, a(/ /)
    eq 1, +/ /.test ' '
    eq 1, +/=/.test '='

  test 'regexps can be empty', ->
    ok //.test ''

  # below test disabled until v8 bug is fixed: https://code.google.com/p/v8/issues/detail?id=956
  #test '#190: heregexen can contain 2 or fewer consecutive slashes', ->
  #  ok /// / // /// instanceof RegExp
