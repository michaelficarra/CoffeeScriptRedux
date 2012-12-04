child_process = require 'child_process'

suite 'Command line execution', ->
  test "--eval -i", (done) ->
    child_process.exec 'bin/coffee --eval -i test/command-line-files/test2.coffee', (error, stdout, stderr) ->
      # Executed module is requires.main
      # Module path is relative to the file
      # Can include another CS module
      # Other module is not requires.main
      eq stdout, "test2 is main true\ntest1 is main false\n"

      ok stderr.indexOf("command-line-files/test1.coffee:5:9, <js>:4:9)") > 0
      ok stderr.indexOf("command-line-files/test2.coffee:4:6, <js>:6:9)") > 0

      done()

  test "--eval --cli", (done) ->
    child_process.exec 'bin/coffee --eval --cli "require \'./test/command-line-files/test2.coffee\'"', (error, stdout, stderr) ->
      eq stdout, "test2 is main false\ntest1 is main false\n"
      done()

