suite 'Macros', ->

  test '__LINE__', ->
    eq 4, __LINE__

  test '__DATE__', ->
    eq (new Date).toDateString()[4..], __DATE__

  test '__TIME__', ->
    ok /^(\d\d:){2}\d\d$/.test __TIME__

  test '__DATETIMEMS__', ->
    ok (-6e4 < (__DATETIMEMS__ - new Date) < 6e4)
    ok 1e12 < __DATETIMEMS__ < 1e13
